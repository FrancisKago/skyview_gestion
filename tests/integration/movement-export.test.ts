import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { getMovementReport } from '@/lib/movement-report';
import { buildMovementExport } from '@/lib/movement-export';
import { stockMovements } from '@/db/schema';

async function seedReport(db: Awaited<ReturnType<typeof createTestDb>>) {
  const { bar, barman, admin } = await seedBase(db);
  const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
  await db.insert(stockMovements).values([
    { productId: castel.id!, locationId: bar.id, type: 'reception' as const, qty: '10', userId: barman.id, createdAt: new Date('2026-02-10T10:00:00') },
    { productId: castel.id!, locationId: bar.id, type: 'reception' as const, qty: '2', userId: barman.id, createdAt: new Date('2026-03-05T10:00:00') },
    { productId: castel.id!, locationId: bar.id, type: 'sortie_service' as const, qty: '-0.4', userId: barman.id, createdAt: new Date('2026-03-10T22:00:00') },
    { productId: castel.id!, locationId: bar.id, type: 'ajustement_admin' as const, qty: '-1', userId: admin.id, createdAt: new Date('2026-03-15T11:00:00') },
  ]);
  return { bar };
}

describe('valorisation des mouvements', () => {
  it('receptionsValue/sortiesValue/ajustementsValue calculés au prix d\'achat (signés pour ajustements)', async () => {
    const db = await createTestDb();
    const { bar } = await seedReport(db);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(l.receptionsValue).toBe(1300);   // 2 × 650
    expect(l.sortiesValue).toBe(260);       // 0,4 × 650
    expect(l.ajustementsValue).toBe(-650);  // -1 × 650
  });
});

describe('buildMovementExport', () => {
  it('csv : BOM, en-têtes français, une ligne par produit avec emplacement, virgule décimale', async () => {
    const db = await createTestDb();
    const { bar } = await seedReport(db);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    const t = buildMovementExport([{ locationName: 'Bar', lines }], {
      format: 'csv', from: '2026-03-01', to: '2026-03-31',
    });
    expect(t.filename).toBe('mouvements-2026-03-01-2026-03-31.csv');
    expect(t.contentType).toContain('csv');
    const text = t.buffer.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = text.slice(1).trim().split('\n');
    expect(header).toBe('Emplacement;Produit;Unité;Stock initial;Réceptions;Sorties;Ajustements;Stock final;Valeur initiale (FCFA);Valeur réceptions (FCFA);Valeur sorties (FCFA);Valeur ajustements (FCFA);Valeur finale (FCFA)');
    expect(row).toBe('Bar;Castel;bouteille;10;2;0,4;-1;10,6;6500;1300;260;-650;6890');
  });
  it('xlsx : une feuille par emplacement, relisible', async () => {
    const db = await createTestDb();
    const { bar } = await seedReport(db);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    const t = buildMovementExport(
      [{ locationName: 'Bar', lines }, { locationName: 'Cuisine', lines: [] }],
      { format: 'xlsx', from: '2026-03-01', to: '2026-03-31' },
    );
    expect(t.filename).toBe('mouvements-2026-03-01-2026-03-31.xlsx');
    const wb = XLSX.read(t.buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Bar', 'Cuisine']);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Bar'], { header: 1 }) as unknown[][];
    expect(rows[0][0]).toBe('Produit');
    expect(rows[1][0]).toBe('Castel');
    expect(rows[1][6]).toBe(10.6); // Stock final numérique dans Excel
  });
  it('csv : champs texte avec ; ou " échappés RFC 4180 (guillemets doublés)', () => {
    const line = {
      productId: 1, name: 'Sirop; grenadine "spécial"', baseUnit: 'litre',
      initial: 1, receptions: 2, sorties: 0.5, ajustements: 0, final: 2.5,
      initialValue: 1000, finalValue: 2500,
      receptionsValue: 2000, sortiesValue: 500, ajustementsValue: 0,
    };
    const t = buildMovementExport([{ locationName: 'Bar', lines: [line] }], {
      format: 'csv', from: '2026-03-01', to: '2026-03-31',
    });
    const [, row] = t.buffer.toString('utf-8').slice(1).trim().split('\n');
    expect(row).toContain('"Sirop; grenadine ""spécial"""');
    expect(row).toBe('Bar;"Sirop; grenadine ""spécial""";litre;1;2;0,5;0;2,5;1000;2000;500;0;2500');
  });
});
