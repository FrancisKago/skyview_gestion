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
  it('refuse un conditionnement incomplet, une taille nulle, une unité vide et des nombres invalides', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const base = { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 };
    // packName sans packSize
    expect((await saveProduct(db, { ...base, packName: 'casier' })).ok).toBe(false);
    // packName composé d'espaces + packSize → rejeté par la règle XOR après trim
    expect((await saveProduct(db, { ...base, packName: '   ', packSize: 12 })).ok).toBe(false);
    // packSize sans packName
    expect((await saveProduct(db, { ...base, packSize: 12 })).ok).toBe(false);
    // packSize 0
    expect((await saveProduct(db, { ...base, packName: 'casier', packSize: 0 })).ok).toBe(false);
    // baseUnit vide
    expect((await saveProduct(db, { name: 'Castel', baseUnit: '  ', purchasePrice: 650 })).ok).toBe(false);
    // purchasePrice NaN
    expect((await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: NaN })).ok).toBe(false);
    // packSize NaN
    expect((await saveProduct(db, { ...base, packName: 'casier', packSize: NaN })).ok).toBe(false);
    // alertThreshold NaN
    expect((await saveProduct(db, { ...base, alertThreshold: NaN })).ok).toBe(false);
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
