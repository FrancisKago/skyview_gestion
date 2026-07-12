import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { recordAdjustment } from '@/lib/adjustments';
import { getLocationStock } from '@/lib/stock';

describe('recordAdjustment', () => {
  it('crée un mouvement signé avec motif', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await recordAdjustment(db, {
      productId: p.id!, locationId: bar.id, qty: -2,
      reason: 'Correction erreur de saisie du 09/07', userId: admin.id,
    });
    expect(res.ok).toBe(true);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(-2);
  });

  it('refuse un ajustement sans motif ou de quantité nulle', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await recordAdjustment(db, {
      productId: p.id!, locationId: bar.id, qty: 1, reason: '  ', userId: admin.id,
    })).ok).toBe(false);
    expect((await recordAdjustment(db, {
      productId: p.id!, locationId: bar.id, qty: 0, reason: 'motif', userId: admin.id,
    })).ok).toBe(false);
  });

  it('refuse une quantité non finie (NaN)', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const res = await recordAdjustment(db, {
      productId: p.id!, locationId: bar.id, qty: NaN, reason: 'motif', userId: admin.id,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('nombre');
  });

  it('refuse un produit inconnu', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const res = await recordAdjustment(db, {
      productId: 999999, locationId: bar.id, qty: 1, reason: 'motif', userId: admin.id,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('inconnu');
  });

  it('refuse un emplacement inconnu ou de type magasin', async () => {
    const db = await createTestDb();
    const { magasin, admin } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const resMagasin = await recordAdjustment(db, {
      productId: p.id!, locationId: magasin.id, qty: 1, reason: 'motif', userId: admin.id,
    });
    expect(resMagasin.ok).toBe(false);
    expect(resMagasin.error).toContain('invalide');

    const resInconnu = await recordAdjustment(db, {
      productId: p.id!, locationId: 999999, qty: 1, reason: 'motif', userId: admin.id,
    });
    expect(resInconnu.ok).toBe(false);
    expect(resInconnu.error).toContain('invalide');
  });
});
