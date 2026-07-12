import { describe, it, expect } from 'vitest';
import { normalizeText, matchesQuery } from '@/lib/text';

describe('normalizeText', () => {
  it('minuscule, sans accents, sans espaces superflus', () => {
    expect(normalizeText('  Bière Pression ')).toBe('biere pression');
    expect(normalizeText('CASTEL 65cl')).toBe('castel 65cl');
  });
});
describe('matchesQuery', () => {
  it('trouve sans tenir compte de la casse ni des accents', () => {
    expect(matchesQuery('Bière Castel 65cl', 'biere')).toBe(true);
    expect(matchesQuery('Poulet DG', 'dg')).toBe(true);
    expect(matchesQuery('Whisky', 'rhum')).toBe(false);
    expect(matchesQuery('Whisky', '')).toBe(true); // requête vide = tout passe
  });
});
