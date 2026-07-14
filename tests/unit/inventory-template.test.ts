import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTemplate, INVENTORY_HEADERS } from '@/lib/templates';
import { parseTable } from '@/lib/import-table';

describe('buildTemplate inventaire', () => {
  it('xlsx : 1re feuille = en-têtes seuls, 2e feuille Exemples, reconnu par parseTable', () => {
    const t = buildTemplate('inventaire', 'xlsx');
    expect(t.filename).toBe('template-inventaire.xlsx');
    const wb = XLSX.read(t.buffer, { type: 'buffer' });
    expect(wb.SheetNames.length).toBe(2);
    expect(wb.SheetNames[1]).toBe('Exemples');
    const res = parseTable(t.buffer, t.filename, [...INVENTORY_HEADERS]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Aucune ligne'); // en-têtes ok, zéro données
  });
  it('csv : BOM + en-têtes Produit;Quantité comptée', () => {
    const t = buildTemplate('inventaire', 'csv');
    expect(t.filename).toBe('template-inventaire.csv');
    const text = t.buffer.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).trim()).toBe('Produit;Quantité comptée');
  });
});
