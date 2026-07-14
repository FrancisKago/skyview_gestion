import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, deleteProduct, archiveProduct, getReferencedProductIds } from '@/lib/products';
import { saveSaleArticle } from '@/lib/sale-articles';
import { createOrder } from '@/lib/orders';
import { products, stockMovements } from '@/db/schema';

describe('deleteProduct', () => {
  it('supprime un produit jamais référencé', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const res = await deleteProduct(db, riz.id!);
    expect(res.ok).toBe(true);
    expect(await db.select().from(products).where(eq(products.id, riz.id!))).toHaveLength(0);
  });
  it('refuse quand une fiche technique le référence (motif « fiche »)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const res = await deleteProduct(db, castel.id!);
    expect(res.ok).toBe(false);
    expect(res.referenced).toBe(true);
    expect(res.error).toContain('fiche');
    expect(res.error).toContain('archivez');
    expect(await db.select().from(products).where(eq(products.id, castel.id!))).toHaveLength(1);
  });
  it('refuse quand un mouvement de stock existe (motif « mouvement »)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await db.insert(stockMovements).values({
      productId: riz.id!, locationId: bar.id, type: 'reception', qty: '5', userId: barman.id,
    });
    const res = await deleteProduct(db, riz.id!);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('mouvement');
  });
  it('refuse quand une commande le référence, même sans mouvement (motif « commande »)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await createOrder(db, { locationId: bar.id, createdBy: barman.id, lines: [{ productId: riz.id!, qtyRequested: 2 }] });
    const res = await deleteProduct(db, riz.id!);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('commande');
  });
  it('produit introuvable -> erreur', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await deleteProduct(db, 999999)).ok).toBe(false);
  });
});

describe('archiveProduct', () => {
  it('archive puis désarchive (bascule active), idempotent', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await archiveProduct(db, riz.id!, true)).ok).toBe(true);
    let [row] = await db.select().from(products).where(eq(products.id, riz.id!));
    expect(row.active).toBe(false);
    expect((await archiveProduct(db, riz.id!, true)).ok).toBe(true); // idempotent
    expect((await archiveProduct(db, riz.id!, false)).ok).toBe(true);
    [row] = await db.select().from(products).where(eq(products.id, riz.id!));
    expect(row.active).toBe(true);
    expect((await archiveProduct(db, 999999, true)).ok).toBe(false);
  });
});

describe('getReferencedProductIds', () => {
  it('retourne les ids référencés quelque part (fiche + mouvement), pas les autres', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const libre = await saveProduct(db, { name: 'Libre', baseUnit: 'kg', purchasePrice: 100 });
    await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    await db.insert(stockMovements).values({
      productId: riz.id!, locationId: bar.id, type: 'reception', qty: '5', userId: barman.id,
    });
    const refs = await getReferencedProductIds(db);
    expect(refs.has(castel.id!)).toBe(true);
    expect(refs.has(riz.id!)).toBe(true);
    expect(refs.has(libre.id!)).toBe(false);
  });
});
