import { describe, it, expect } from 'vitest';
import { filterComboOptions, resolveExact, type ComboOption } from '@/lib/combo-filter';

const opts: ComboOption[] = [
  { id: 1, label: 'Castel 65cl', group: '★ Fréquents', sublabel: 'bouteille' },
  { id: 2, label: 'Guinness', group: '★ Fréquents' },
  { id: 3, label: 'Poulet', group: 'Vivres' },
  { id: 4, label: 'Plantain', group: 'Vivres' },
  { id: 5, label: 'Pastis 51' },
  { id: 6, label: 'Coca-Cola' },
  { id: 7, label: 'Fanta' },
  { id: 8, label: 'Sprite' },
  { id: 9, label: 'Eau minérale' },
  { id: 10, label: 'Café Touba' },
];

describe('filterComboOptions', () => {
  it('requête vide : les max premières options, ordre préservé (fréquents en tête)', () => {
    const res = filterComboOptions(opts, '', 8);
    expect(res).toHaveLength(8);
    expect(res[0].label).toBe('Castel 65cl');
  });
  it('filtre insensible à la casse et aux accents, en « contient »', () => {
    expect(filterComboOptions(opts, 'CAST', 8).map((o) => o.label)).toEqual(['Castel 65cl']);
    expect(filterComboOptions(opts, 'cafe', 8).map((o) => o.label)).toEqual(['Café Touba']);
    expect(filterComboOptions(opts, 'anta', 8).map((o) => o.label)).toEqual(['Plantain', 'Fanta']);
  });
  it('respecte max même en filtrant', () => {
    expect(filterComboOptions(opts, 'a', 3)).toHaveLength(3);
  });
});

describe('resolveExact', () => {
  it('résout une égalité exacte normalisée (casse/accents)', () => {
    expect(resolveExact(opts, 'castel 65CL')?.id).toBe(1);
    expect(resolveExact(opts, 'CAFÉ touba')?.id).toBe(10);
  });
  it('ne résout pas un préfixe, un texte vide ou un inconnu', () => {
    expect(resolveExact(opts, 'Castel')).toBeNull();
    expect(resolveExact(opts, '')).toBeNull();
    expect(resolveExact(opts, 'Whisky')).toBeNull();
  });
});
