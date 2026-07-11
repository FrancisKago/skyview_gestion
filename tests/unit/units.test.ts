import { describe, it, expect } from 'vitest';
import { round3, packsToBase, totalBase } from '@/lib/units';

describe('units', () => {
  it('convertit des conditionnements en unités de base', () => {
    expect(packsToBase(3, 12)).toBe(36);
    expect(packsToBase(0.5, 12)).toBe(6);
  });
  it('arrondit à 3 décimales (pas de dérive flottante)', () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
    expect(packsToBase(0.1, 3)).toBe(0.3);
  });
  it('totalBase = packs convertis + unités saisies directement', () => {
    // le magasinier livre 2 casiers + 5 bouteilles à l'unité
    expect(totalBase({ packs: 2, units: 5, packSize: 12 })).toBe(29);
    // produit sans conditionnement : les packs sont ignorés
    expect(totalBase({ packs: 2, units: 5, packSize: null })).toBe(5);
  });
});
