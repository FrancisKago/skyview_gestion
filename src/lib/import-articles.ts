import { ne } from 'drizzle-orm';
import { locations, products, saleArticles } from '@/db/schema';
import { saveSaleArticle } from './sale-articles';
import { preferActive } from './products';
import { normalizeText, suggestClosest } from './text';
import { toNumber, type ParsedRow } from './import-table';
import { round3 } from './units';
import type { ImportReport } from './import-products';
import type { AnyDb } from '@/db';

interface Group {
  firstLine: number;
  cashName: string;      // orthographe de la première occurrence
  locationRaw: string;
  lines: Array<{ line: number; productRaw: string; qtyRaw: string }>;
}

// Import en masse des articles (une ligne par ingrédient, groupées par
// (article, emplacement) normalisés). Un produit inconnu, un emplacement
// invalide ou une quantité non numérique rejettent le GROUPE entier. Les
// doublons de produit dans un groupe s'additionnent. update=true remplace
// intégralement la fiche existante (l'orthographe du nom caisse existant est
// conservée : c'est la clé de correspondance avec l'export caisse). Spec §8.
export async function importArticles(
  db: AnyDb, rows: ParsedRow[], opts: { update: boolean },
): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, ignored: 0, duplicates: 0, rejects: [] };

  const groups = new Map<string, Group>();
  for (const r of rows) {
    const article = (r.cells['Article caisse'] ?? '').trim();
    const emplacement = (r.cells['Emplacement'] ?? '').trim();
    if (!article) { report.rejects.push({ line: r.line, reason: 'Article caisse manquant' }); continue; }
    const key = `${normalizeText(article)}|${normalizeText(emplacement)}`;
    if (!groups.has(key)) {
      groups.set(key, { firstLine: r.line, cashName: article, locationRaw: emplacement, lines: [] });
    }
    groups.get(key)!.lines.push({
      line: r.line, productRaw: (r.cells['Produit'] ?? '').trim(), qtyRaw: r.cells['Quantité'] ?? '',
    });
  }

  const locs: Array<{ id: number; name: string }> = await db.select({
    id: locations.id, name: locations.name,
  }).from(locations).where(ne(locations.type, 'magasin'));
  const locByName = new Map(locs.map((l) => [normalizeText(l.name), l.id]));

  const prods: Array<{ id: number; name: string; active: boolean }> = await db.select({
    id: products.id, name: products.name, active: products.active,
  }).from(products);
  // Homonymes actif/archivé : l'actif fait foi (cf. preferActive).
  const prodByName = new Map(preferActive(prods).map((p) => [normalizeText(p.name), p]));
  const prodNames = prods.map((p) => p.name);

  const arts: Array<{ id: number; cashName: string }> = await db.select({
    id: saleArticles.id, cashName: saleArticles.cashName,
  }).from(saleArticles);
  const artByName = new Map(arts.map((a) => [normalizeText(a.cashName), a]));

  for (const g of groups.values()) {
    const locationId = locByName.get(normalizeText(g.locationRaw));
    if (!locationId) {
      report.rejects.push({ line: g.firstLine, reason: `Emplacement invalide : « ${g.locationRaw} » (attendu : Bar ou Cuisine)` });
      continue;
    }
    // Fiche : produits + quantités, doublons additionnés.
    const byProduct = new Map<number, number>();
    let rejected = false;
    for (const l of g.lines) {
      const prod = prodByName.get(normalizeText(l.productRaw));
      if (!prod) {
        const suggestion = suggestClosest(l.productRaw, prodNames);
        report.rejects.push({
          line: l.line,
          reason: `Produit « ${l.productRaw} » introuvable${suggestion ? ` — vouliez-vous « ${suggestion} » ?` : ''}`,
        });
        rejected = true; break;
      }
      const qty = toNumber(l.qtyRaw);
      if (qty == null || qty <= 0) {
        report.rejects.push({ line: l.line, reason: `Quantité invalide : « ${l.qtyRaw} »` });
        rejected = true; break;
      }
      byProduct.set(prod.id, round3((byProduct.get(prod.id) ?? 0) + qty));
    }
    if (rejected) continue;

    const existing = artByName.get(normalizeText(g.cashName));
    if (existing && !opts.update) { report.ignored++; continue; }

    const res = await saveSaleArticle(db, {
      id: existing?.id,
      cashName: existing ? existing.cashName : g.cashName,
      locationId,
      lines: [...byProduct.entries()].map(([productId, qty]) => ({ productId, qty })),
    });
    if (!res.ok) {
      report.rejects.push({ line: g.firstLine, reason: res.error ?? 'Groupe invalide' });
    } else if (existing) {
      report.updated++;
    } else {
      report.created++;
      if (res.id) artByName.set(normalizeText(g.cashName), { id: res.id, cashName: g.cashName });
    }
  }
  return report;
}
