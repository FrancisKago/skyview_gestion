import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';

describe('saveProduct', () => {
  it('crée un produit avec conditionnement', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const res = await saveProduct(db, {
      name: 'Castel 65cl', category: 'Bière', baseUnit: 'bouteille',
      packName: 'casier', packSize: 12, purchasePrice: 650, alertThreshold: 24,
    });
    expect(res.ok).toBe(true);
  });
  it('refuse un prix négatif et un nom vide', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await saveProduct(db, { name: '', baseUnit: 'kg', purchasePrice: 100 })).ok).toBe(false);
    expect((await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: -5 })).ok).toBe(false);
  });
  it('met à jour un produit existant via id', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const created = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const updated = await saveProduct(db, { id: created.id, name: 'Riz parfumé', baseUnit: 'kg', purchasePrice: 600 });
    expect(updated.ok).toBe(true);
    expect(updated.id).toBe(created.id);
  });
});
