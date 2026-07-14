import { products } from '@/db/schema';
import { preferActive, saveProduct } from './products';
import { normalizeText } from './text';
import { toNumber, type ParsedRow } from './import-table';
import type { AnyDb } from '@/db';

export interface ImportReport {
  created: number; updated: number; ignored: number; duplicates: number;
  rejects: Array<{ line: number; reason: string }>;
}

// Import en masse des produits. Correspondance des existants par nom normalisé.
// update=false : existant -> ignoré. update=true : la ligne fait foi (les
// optionnels vides EFFACENT le champ). Chaque ligne est indépendante (pas de
// transaction globale — convention v1 neon-http). Spec §8.
export async function importProducts(
  db: AnyDb, rows: ParsedRow[], opts: { update: boolean },
): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, ignored: 0, duplicates: 0, rejects: [] };

  // Doublons internes : la dernière occurrence (par nom normalisé) fait foi.
  const byName = new Map<string, ParsedRow>();
  for (const r of rows) {
    const key = normalizeText(r.cells['Nom'] ?? '');
    if (!key) { report.rejects.push({ line: r.line, reason: 'Nom manquant' }); continue; }
    if (byName.has(key)) report.duplicates++;
    byName.set(key, r);
  }

  const existing: Array<{ id: number; name: string; active: boolean }> = await db.select({
    id: products.id, name: products.name, active: products.active,
  }).from(products);
  // Homonymes actif/archivé : l'actif fait foi (cf. preferActive).
  const existingByName = new Map(preferActive(existing).map((p) => [normalizeText(p.name), p.id]));

  for (const [key, r] of byName) {
    const c = r.cells;
    const price = toNumber(c["Prix d'achat (FCFA)"] ?? '');
    if (price == null) {
      report.rejects.push({ line: r.line, reason: "Prix d'achat manquant ou non numérique" });
      continue;
    }
    const packSizeRaw = (c['Taille conditionnement'] ?? '').trim();
    const packSize = packSizeRaw ? toNumber(packSizeRaw) : null;
    if (packSizeRaw && packSize == null) {
      report.rejects.push({ line: r.line, reason: 'Taille de conditionnement non numérique' });
      continue;
    }
    const thresholdRaw = (c["Seuil d'alerte"] ?? '').trim();
    const alertThreshold = thresholdRaw ? toNumber(thresholdRaw) : null;
    if (thresholdRaw && alertThreshold == null) {
      report.rejects.push({ line: r.line, reason: "Seuil d'alerte non numérique" });
      continue;
    }
    const existingId = existingByName.get(key);
    if (existingId && !opts.update) { report.ignored++; continue; }

    const res = await saveProduct(db, {
      id: existingId, // undefined -> création
      name: c['Nom'],
      category: c['Catégorie'] ?? '',
      baseUnit: c['Unité de base'] ?? '',
      packName: (c['Conditionnement'] ?? '').trim() || null,
      packSize,
      purchasePrice: price,
      alertThreshold,
    });
    if (!res.ok) {
      report.rejects.push({ line: r.line, reason: res.error ?? 'Ligne invalide' });
    } else if (existingId) {
      report.updated++;
    } else {
      report.created++;
      if (res.id) existingByName.set(key, res.id); // cohérence si relecture
    }
  }
  return report;
}
