import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSalesFile } from '@/lib/sales-file';

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

describe('parseSalesFile', () => {
  it('parse un CSV séparé par point-virgule avec en-têtes', () => {
    const buf = csvBuffer('Article;Quantité\nCastel 65cl;24\nPoulet DG;7\n');
    const res = parseSalesFile(buf, 'ventes.csv');
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { articleName: 'Castel 65cl', qty: 24 },
      { articleName: 'Poulet DG', qty: 7 },
    ]);
  });

  it('parse un fichier Excel (2 colonnes : article, quantité)', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Article', 'Qté'], ['Guinness', 12], ['Whisky (verre)', 30]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventes');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = parseSalesFile(buf, 'ventes.xlsx');
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { articleName: 'Guinness', qty: 12 },
      { articleName: 'Whisky (verre)', qty: 30 },
    ]);
  });

  it('cumule les doublons et ignore les lignes sans quantité numérique', () => {
    const buf = csvBuffer('Article;Qte\nCastel;10\nCastel;5\nLigne vide;\n');
    const res = parseSalesFile(buf, 'ventes.csv');
    expect(res.rows).toEqual([{ articleName: 'Castel', qty: 15 }]);
    expect(res.skipped).toBe(1);
  });

  it('signale un fichier illisible', () => {
    const res = parseSalesFile(Buffer.from([0x00, 0x01]), 'fichier.bin');
    expect(res.ok).toBe(false);
  });

  it('accepte les quantités à virgule décimale', () => {
    const buf = csvBuffer('Article;Quantité\nVin (verre);1,5\n');
    const res = parseSalesFile(buf, 'ventes.csv');
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([{ articleName: 'Vin (verre)', qty: 1.5 }]);
  });

  it('supporte aussi un CSV séparé par virgules', () => {
    const buf = csvBuffer('Article,Quantité\nCastel 65cl,24\nPoulet DG,7\n');
    const res = parseSalesFile(buf, 'ventes.csv');
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { articleName: 'Castel 65cl', qty: 24 },
      { articleName: 'Poulet DG', qty: 7 },
    ]);
  });

  it('signale un fichier vide', () => {
    const res = parseSalesFile(Buffer.from(''), 'ventes.csv');
    expect(res.ok).toBe(false);
  });
});
