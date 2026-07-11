import { describe, it, expect } from 'vitest';
import { computeTheoretical, reconcile } from '@/lib/reconciliation';

describe('computeTheoretical', () => {
  it('multiplie les ventes par les fiches techniques et cumule par produit', () => {
    const recipes = new Map([
      [1, [{ productId: 10, qty: 1 }]],                                   // Castel = 1 bouteille (p10)
      [2, [{ productId: 20, qty: 0.4 }, { productId: 30, qty: 0.2 }]],    // Poulet DG
      [3, [{ productId: 20, qty: 0.3 }]],                                 // Poulet rôti (même poulet p20)
    ]);
    const sales = [
      { saleArticleId: 1, qty: 24 },
      { saleArticleId: 2, qty: 5 },
      { saleArticleId: 3, qty: 4 },
    ];
    const theo = computeTheoretical(sales, recipes);
    expect(theo.get(10)).toBe(24);
    expect(theo.get(20)).toBeCloseTo(3.2); // 5×0.4 + 4×0.3
    expect(theo.get(30)).toBeCloseTo(1.0);
  });
});

describe('reconcile', () => {
  it('compare théorique et déclaré, valorise les écarts en FCFA', () => {
    const theoretical = new Map([[10, 24], [20, 3.2]]);
    const declared = new Map([[10, 24], [20, 2.8]]);
    const products = new Map([
      [10, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 }],
      [20, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 }],
    ]);
    const lines = reconcile(theoretical, declared, products);
    expect(lines).toEqual([
      { productId: 10, name: 'Castel', baseUnit: 'bouteille',
        theoretical: 24, declared: 24, gap: 0, gapValue: 0 },
      { productId: 20, name: 'Poulet', baseUnit: 'kg',
        theoretical: 3.2, declared: 2.8, gap: -0.4, gapValue: -1400 },
    ]);
  });
  it('inclut les produits déclarés mais non vendus, et inversement', () => {
    const theoretical = new Map([[10, 5]]);   // vendu mais aucune sortie déclarée
    const declared = new Map([[20, 2]]);       // sorti mais aucune vente
    const products = new Map([
      [10, { name: 'A', baseUnit: 'u', purchasePrice: 100 }],
      [20, { name: 'B', baseUnit: 'u', purchasePrice: 200 }],
    ]);
    const lines = reconcile(theoretical, declared, products);
    expect(lines.find((l) => l.productId === 10)).toMatchObject({ theoretical: 5, declared: 0, gap: -5 });
    expect(lines.find((l) => l.productId === 20)).toMatchObject({ theoretical: 0, declared: 2, gap: 2 });
  });
});
