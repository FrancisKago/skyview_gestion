export interface GroupableProduct { id: number; name: string; category: string }
export interface ProductGroup<T> { label: string; products: T[] }

// Fréquents (freq > 0) en tête, tri fréquence desc puis nom ; le reste par catégorie
// alphabétique ('Autres' si vide). Spec §6.2-6.3.
export function groupProducts<T extends GroupableProduct>(
  products: T[], freq: Map<number, number>,
): Array<ProductGroup<T>> {
  const frequents = products
    .filter((p) => (freq.get(p.id) ?? 0) > 0)
    .sort((a, b) => (freq.get(b.id)! - freq.get(a.id)!) || a.name.localeCompare(b.name, 'fr'));
  const rest = products.filter((p) => (freq.get(p.id) ?? 0) === 0);
  const byCat = new Map<string, T[]>();
  for (const p of rest) {
    const cat = p.category.trim() || 'Autres';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(p);
  }
  const groups = [...byCat.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .map(([label, ps]) => ({ label, products: ps.sort((a, b) => a.name.localeCompare(b.name, 'fr')) }));
  return [...(frequents.length ? [{ label: '★ Fréquents', products: frequents }] : []), ...groups];
}
