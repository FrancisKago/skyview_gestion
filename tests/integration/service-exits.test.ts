import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { recordServiceExit } from '@/lib/service-exits';
import { getLocationStock } from '@/lib/stock';
import { stockMovements } from '@/db/schema';

describe('recordServiceExit', () => {
  it('crée des mouvements négatifs et signale un stock devenu négatif sans bloquer', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'reception', qty: '10', userId: barman.id,
    });
    // Sortie de 12 alors que le stock est de 10 : accepté, avec avertissement
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-10', createdBy: barman.id,
      lines: [{ productId: castel.id!, qty: 12 }],
    });
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual([expect.stringContaining('Castel')]);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(-2);
  });

  it('refuse une saisie vide ou des quantités négatives', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    expect((await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-10', createdBy: barman.id, lines: [],
    })).ok).toBe(false);
  });

  it('fusionne les lignes en double du même produit (somme des quantités)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'reception', qty: '20', userId: barman.id,
    });
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-10', createdBy: barman.id,
      lines: [{ productId: castel.id!, qty: 5 }, { productId: castel.id!, qty: 7 }],
    });
    expect(res.ok).toBe(true);
    const movements = await db.select().from(stockMovements)
      .where(eq(stockMovements.type, 'sortie_service'));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].qty)).toBe(-12);
  });

  it('refuse un produit inconnu dans la saisie', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-10', createdBy: barman.id,
      lines: [{ productId: 999999, qty: 1 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('inconnu');
  });

  it('refuse une date de service invalide', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: 'not-a-date', createdBy: barman.id,
      lines: [{ productId: castel.id!, qty: 1 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Date de service invalide');
  });

  it('refuse une quantité non finie (NaN)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-10', createdBy: barman.id,
      lines: [{ productId: castel.id!, qty: NaN }],
    });
    expect(res.ok).toBe(false);
  });
});
