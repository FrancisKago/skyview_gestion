import { describe, it, expect } from 'vitest';
import { groupProducts } from '@/lib/product-grouping';

const P = (id: number, name: string, category = '') => ({ id, name, category });

describe('groupProducts', () => {
  it('met les fréquents en premier (tri par fréquence puis nom), puis groupe par catégorie', () => {
    const products = [P(1, 'Castel', 'Bières'), P(2, 'Guinness', 'Bières'), P(3, 'Riz', 'Vivres'), P(4, 'Whisky')];
    const freq = new Map([[2, 10], [1, 10], [3, 2]]);
    const groups = groupProducts(products, freq);
    expect(groups[0].label).toBe('★ Fréquents');
    expect(groups[0].products.map((p) => p.name)).toEqual(['Castel', 'Guinness', 'Riz']); // 10/10 → alphabétique, puis 2
    expect(groups.slice(1).map((g) => g.label)).toEqual(['Autres']); // catégorie vide → Autres
    expect(groups[1].products.map((p) => p.name)).toEqual(['Whisky']);
  });
  it('sans fréquence : uniquement les groupes de catégories, triés', () => {
    const groups = groupProducts([P(1, 'Riz', 'Vivres'), P(2, 'Castel', 'Bières')], new Map());
    expect(groups.map((g) => g.label)).toEqual(['Bières', 'Vivres']);
  });
});
