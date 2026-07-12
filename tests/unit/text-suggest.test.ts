import { describe, it, expect } from 'vitest';
import { suggestClosest } from '@/lib/text';

describe('suggestClosest', () => {
  it('suggère le nom le plus proche à distance ≤ 2 (insensible casse/accents)', () => {
    const candidates = ['Plantain', 'Poulet', 'Castel 65cl'];
    expect(suggestClosest('Plantin', candidates)).toBe('Plantain');   // distance 1
    expect(suggestClosest('poulét', candidates)).toBe('Poulet');      // accents ignorés
    expect(suggestClosest('Whisky', candidates)).toBeNull();          // trop loin
    expect(suggestClosest('castel 65c', candidates)).toBe('Castel 65cl'); // distance 1
  });
  it('retourne null pour une liste vide', () => {
    expect(suggestClosest('X', [])).toBeNull();
  });
});
