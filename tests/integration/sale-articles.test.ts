import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { saveSaleArticle, getRecipeMap } from '@/lib/sale-articles';

describe('articles de vente', () => {
  it('crée un article avec sa fiche technique', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const whisky = await saveProduct(db, { name: 'Whisky Black (L)', baseUnit: 'L', purchasePrice: 12000 });
    const res = await saveSaleArticle(db, {
      cashName: 'Whisky (verre)', locationId: bar.id,
      lines: [{ productId: whisky.id!, qty: 0.04 }],
    });
    expect(res.ok).toBe(true);
    const map = await getRecipeMap(db);
    expect(map.get(res.id!)).toEqual([{ productId: whisky.id, qty: 0.04 }]);
  });
  it('refuse une fiche vide ou une quantité nulle', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    expect((await saveSaleArticle(db, { cashName: 'X', locationId: bar.id, lines: [] })).ok).toBe(false);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await saveSaleArticle(db, {
      cashName: 'Y', locationId: bar.id, lines: [{ productId: p.id!, qty: 0 }],
    })).ok).toBe(false);
  });
  it('remplace la fiche à la mise à jour (pas de doublons de lignes)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const created = await saveSaleArticle(db, {
      cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: p.id!, qty: 1 }],
    });
    await saveSaleArticle(db, {
      id: created.id, cashName: 'Castel 65cl', locationId: bar.id,
      lines: [{ productId: p.id!, qty: 2 }],
    });
    const map = await getRecipeMap(db);
    expect(map.get(created.id!)).toEqual([{ productId: p.id, qty: 2 }]);
  });
  it('refuse une quantité non finie (NaN/Infinity)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await saveSaleArticle(db, {
      cashName: 'Z', locationId: bar.id, lines: [{ productId: p.id!, qty: NaN }],
    })).ok).toBe(false);
    expect((await saveSaleArticle(db, {
      cashName: 'W', locationId: bar.id, lines: [{ productId: p.id!, qty: Infinity }],
    })).ok).toBe(false);
  });
  it('refuse un produit inconnu dans la fiche', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const res = await saveSaleArticle(db, {
      cashName: 'Fantôme', locationId: bar.id, lines: [{ productId: 9999, qty: 1 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Produit inconnu dans la fiche');
  });
  it("refuse un nom caisse composé uniquement d'espaces", async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await saveSaleArticle(db, {
      cashName: '   ', locationId: bar.id, lines: [{ productId: p.id!, qty: 1 }],
    })).ok).toBe(false);
  });
  it('refuse un nom caisse déjà utilisé', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const first = await saveSaleArticle(db, {
      cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: p.id!, qty: 1 }],
    });
    expect(first.ok).toBe(true);
    const dup = await saveSaleArticle(db, {
      cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: p.id!, qty: 1 }],
    });
    expect(dup.ok).toBe(false);
    expect(dup.error).toBe('Ce nom caisse existe déjà');
  });
});
