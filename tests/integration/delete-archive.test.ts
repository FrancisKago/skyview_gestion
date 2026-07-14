import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, deleteProduct, archiveProduct, getReferencedProductIds } from '@/lib/products';
import { saveSaleArticle, deleteSaleArticle, archiveSaleArticle, getReferencedArticleIds } from '@/lib/sale-articles';
import { createOrder } from '@/lib/orders';
import { products, saleArticles, recipeLines, stockMovements, salesImports, salesImportLines } from '@/db/schema';

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

describe('deleteSaleArticle', () => {
  it('supprime un article jamais vendu, avec sa fiche (cascade)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const art = await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const res = await deleteSaleArticle(db, art.id!);
    expect(res.ok).toBe(true);
    expect(await db.select().from(saleArticles).where(eq(saleArticles.id, art.id!))).toHaveLength(0);
    expect(await db.select().from(recipeLines).where(eq(recipeLines.saleArticleId, art.id!))).toHaveLength(0);
    // le produit ingrédient, lui, reste
    expect(await db.select().from(products).where(eq(products.id, castel.id!))).toHaveLength(1);
  });
  it('refuse quand des ventes importées le référencent (motif « vente »)', async () => {
    const db = await createTestDb();
    const { bar, comptable } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const art = await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const [imp] = await db.insert(salesImports).values({
      filename: 'ventes.xlsx', serviceDate: '2026-07-13', uploadedBy: comptable.id,
    }).returning();
    await db.insert(salesImportLines).values({
      importId: imp.id, articleNameRaw: 'Castel 65cl', qty: '3', saleArticleId: art.id!,
    });
    const res = await deleteSaleArticle(db, art.id!);
    expect(res.ok).toBe(false);
    expect(res.referenced).toBe(true);
    expect(res.error).toContain('vente');
    expect(res.error).toContain('archivez');
  });
  it('article introuvable -> erreur', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await deleteSaleArticle(db, 999999)).ok).toBe(false);
  });
});

describe('archiveSaleArticle', () => {
  it('archive puis désarchive (bascule active), idempotent', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const art = await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    expect((await archiveSaleArticle(db, art.id!, true)).ok).toBe(true);
    let [row] = await db.select().from(saleArticles).where(eq(saleArticles.id, art.id!));
    expect(row.active).toBe(false);
    expect((await archiveSaleArticle(db, art.id!, true)).ok).toBe(true);
    expect((await archiveSaleArticle(db, art.id!, false)).ok).toBe(true);
    [row] = await db.select().from(saleArticles).where(eq(saleArticles.id, art.id!));
    expect(row.active).toBe(true);
    expect((await archiveSaleArticle(db, 999999, true)).ok).toBe(false);
  });
});

describe('getReferencedArticleIds', () => {
  it('retourne les ids d\'articles vendus, pas les autres', async () => {
    const db = await createTestDb();
    const { bar, comptable } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const vendu = await saveSaleArticle(db, { cashName: 'Vendu', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const jamais = await saveSaleArticle(db, { cashName: 'Jamais', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const [imp] = await db.insert(salesImports).values({
      filename: 'v.xlsx', serviceDate: '2026-07-13', uploadedBy: comptable.id,
    }).returning();
    await db.insert(salesImportLines).values({
      importId: imp.id, articleNameRaw: 'Vendu', qty: '1', saleArticleId: vendu.id!,
    });
    const refs = await getReferencedArticleIds(db);
    expect(refs.has(vendu.id!)).toBe(true);
    expect(refs.has(jamais.id!)).toBe(false);
  });
});
