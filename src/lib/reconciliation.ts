import { round3 } from './units';

export type RecipeMap = Map<number, Array<{ productId: number; qty: number }>>;

export function computeTheoretical(
  sales: Array<{ saleArticleId: number; qty: number }>,
  recipes: RecipeMap,
): Map<number, number> {
  const theo = new Map<number, number>();
  for (const sale of sales) {
    for (const line of recipes.get(sale.saleArticleId) ?? []) {
      theo.set(line.productId, round3((theo.get(line.productId) ?? 0) + sale.qty * line.qty));
    }
  }
  return theo;
}

export interface ReconciliationLine {
  productId: number; name: string; baseUnit: string;
  theoretical: number; declared: number;
  gap: number;       // declared - theoretical ; négatif = sorties manquantes
  gapValue: number;  // FCFA
}

export function reconcile(
  theoretical: Map<number, number>,
  declared: Map<number, number>,
  products: Map<number, { name: string; baseUnit: string; purchasePrice: number }>,
): ReconciliationLine[] {
  const productIds = new Set([...theoretical.keys(), ...declared.keys()]);
  const lines: ReconciliationLine[] = [];
  for (const productId of productIds) {
    const p = products.get(productId);
    if (!p) continue; // produit supprimé depuis — ne devrait pas arriver en usage normal, on l'ignore plutôt que de planter
    const theo = theoretical.get(productId) ?? 0;
    const decl = declared.get(productId) ?? 0;
    const gap = round3(decl - theo);
    lines.push({
      productId, name: p.name, baseUnit: p.baseUnit,
      theoretical: theo, declared: decl,
      gap, gapValue: Math.round(gap * p.purchasePrice),
    });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
