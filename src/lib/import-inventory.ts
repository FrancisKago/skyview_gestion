import { products } from '@/db/schema';
import { validateInventory, type InventoryGap } from './inventories';
import { normalizeText, suggestClosest } from './text';
import { toNumber, type ParsedRow } from './import-table';
import type { AnyDb } from '@/db';

export interface InventoryImportReport {
  counted: number; duplicates: number;
  rejects: Array<{ line: number; reason: string }>;
  gaps: InventoryGap[];
}

// Import d'un comptage d'inventaire (spec import-inventaire §3) : résout les noms
// de produits (normalisés, suggestions), puis délègue TOUT le métier à
// validateInventory (écarts, mouvements ajustement_inventaire, statut). Les
// produits archivés restent comptables (on peut inventorier un produit retiré
// encore en rayon). Les rejets ne bloquent pas les lignes valides ; les produits
// absents du fichier ne sont pas comptés (stock intact).
export async function importInventory(
  db: AnyDb, rows: ParsedRow[],
  opts: { locationId: number; inventoryDate: string; countedBy: number },
): Promise<{ ok: boolean; error?: string; report?: InventoryImportReport }> {
  const report: InventoryImportReport = { counted: 0, duplicates: 0, rejects: [], gaps: [] };

  const prods: Array<{ id: number; name: string }> = await db.select({
    id: products.id, name: products.name,
  }).from(products);
  const byName = new Map(prods.map((p) => [normalizeText(p.name), p]));
  const names = prods.map((p) => p.name);

  // Dernière ligne fait foi par produit (un comptage ne s'additionne pas —
  // même convention que la fusion de validateInventory).
  const byProduct = new Map<number, number>();
  for (const r of rows) {
    const raw = (r.cells['Produit'] ?? '').trim();
    if (!raw) { report.rejects.push({ line: r.line, reason: 'Produit manquant' }); continue; }
    const prod = byName.get(normalizeText(raw));
    if (!prod) {
      const s = suggestClosest(raw, names);
      report.rejects.push({
        line: r.line,
        reason: `Produit « ${raw} » introuvable${s ? ` — vouliez-vous « ${s} » ?` : ''}`,
      });
      continue;
    }
    const qtyRaw = (r.cells['Quantité comptée'] ?? '').trim();
    const qty = toNumber(qtyRaw);
    if (qty == null || qty < 0) {
      report.rejects.push({ line: r.line, reason: `Quantité invalide : « ${qtyRaw} »` });
      continue;
    }
    if (byProduct.has(prod.id)) report.duplicates++;
    byProduct.set(prod.id, qty);
  }

  if (byProduct.size === 0) {
    return { ok: false, error: 'Aucune ligne exploitable', report };
  }

  const res = await validateInventory(db, {
    locationId: opts.locationId, inventoryDate: opts.inventoryDate, countedBy: opts.countedBy,
    lines: [...byProduct.entries()].map(([productId, qtyCounted]) => ({ productId, qtyCounted })),
  });
  if (!res.ok) return { ok: false, error: res.error, report };

  report.counted = byProduct.size;
  report.gaps = res.gaps ?? [];
  return { ok: true, report };
}
