import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTable, toNumber } from '@/lib/import-table';

const HEADERS = ['Nom', 'Catégorie', 'Prix'];

function csv(content: string): Buffer { return Buffer.from(content, 'utf-8'); }

describe('parseTable', () => {
  it('reconnaît les en-têtes normalisés (casse/accents) et numérote les lignes', () => {
    const res = parseTable(csv('nom;CATEGORIE;prix\nCastel;Bières;650\n;;\nRiz;Vivres;500\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { line: 2, cells: { 'Nom': 'Castel', 'Catégorie': 'Bières', 'Prix': '650' } },
      { line: 4, cells: { 'Nom': 'Riz', 'Catégorie': 'Vivres', 'Prix': '500' } }, // ligne 3 vide sautée
    ]);
  });
  it('parse un xlsx et ne lit que la première feuille', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nom', 'Catégorie', 'Prix'], ['Guinness', 'Bières', 800]]), 'Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Exemples', 'ignorés']]), 'Exemples');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = parseTable(buf, 'x.xlsx', HEADERS);
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].cells['Nom']).toBe('Guinness');
  });
  it('rejette des en-têtes manquants ou inconnus avec un message clair', () => {
    expect(parseTable(csv('Nom;Prix\nX;1\n'), 'x.csv', HEADERS).ok).toBe(false);           // Catégorie manquante
    expect(parseTable(csv('Nom;Catégorie;Prix;Bonus\nX;Y;1;2\n'), 'x.csv', HEADERS).ok).toBe(false); // colonne inconnue
  });
  it('rejette un fichier vide ou illisible', () => {
    expect(parseTable(csv(''), 'x.csv', HEADERS).ok).toBe(false);
    expect(parseTable(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), 'x.xlsx', HEADERS).ok).toBe(false);
  });
});

describe('toNumber', () => {
  it('accepte la virgule décimale, refuse le non-numérique', () => {
    expect(toNumber('1,5')).toBe(1.5);
    expect(toNumber('650')).toBe(650);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('')).toBeNull();
  });
});

describe('parseTable — en-têtes durcis', () => {
  it("rejette une cellule d'en-tête vide au milieu, avec sa position", () => {
    const res = parseTable(csv('Nom;;Prix\nX;;1\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('position 2');
  });
  it('rejette un en-tête en double (comparaison normalisée)', () => {
    const res = parseTable(csv('Nom;NOM;Prix\nX;Y;1\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('double');
  });
  it("tolère les cellules vides en FIN de ligne d'en-tête (artefact Excel)", () => {
    const res = parseTable(csv('Nom;Catégorie;Prix;;\nCastel;Bières;650;;\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(true);
    expect(res.rows[0].cells['Prix']).toBe('650');
  });
});
