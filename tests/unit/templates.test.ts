import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTemplate, PRODUCT_HEADERS, ARTICLE_HEADERS } from '@/lib/templates';
import { parseTable } from '@/lib/import-table';

describe('buildTemplate', () => {
  it('xlsx produits : 1re feuille = en-têtes seuls, 2e feuille Exemples ignorée par parseTable', () => {
    const t = buildTemplate('produits', 'xlsx');
    expect(t.filename).toBe('template-produits.xlsx');
    const wb = XLSX.read(t.buffer, { type: 'buffer' });
    expect(wb.SheetNames.length).toBe(2);
    expect(wb.SheetNames[1]).toBe('Exemples');
    // le template rempli d'aucune ligne est "vide" pour parseTable (en-têtes ok, 0 données)
    const res = parseTable(t.buffer, t.filename, [...PRODUCT_HEADERS]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Aucune ligne');
  });
  it('csv articles : en-têtes seuls, séparateur ;, BOM UTF-8', () => {
    const t = buildTemplate('articles', 'csv');
    expect(t.filename).toBe('template-articles.csv');
    expect(t.contentType).toContain('csv');
    const text = t.buffer.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(text.slice(1).trim()).toBe(ARTICLE_HEADERS.join(';'));
  });
});
