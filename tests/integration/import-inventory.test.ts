import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, archiveProduct } from '@/lib/products';
import { importInventory } from '@/lib/import-inventory';
import { stockMovements } from '@/db/schema';

const row = (line: number, produit: string, qty: string) => ({
  line, cells: { 'Produit': produit, 'Quantité comptée': qty },
});

// Pose un stock théorique par une réception directe dans le journal.
async function giveStock(db: Awaited<ReturnType<typeof createTestDb>>,
  productId: number, locationId: number, qty: number, userId: number) {
  await db.insert(stockMovements).values({
    productId, locationId, type: 'reception', qty: String(qty), userId,
  });
}

describe('importInventory', () => {
  it('comptage nominal : écarts corrects et mouvements ajustement_inventaire créés', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await giveStock(db, castel.id!, bar.id, 24, admin.id);
    await giveStock(db, riz.id!, bar.id, 10, admin.id);
    const res = await importInventory(db, [
      row(2, 'castel 65CL', '20'),   // écart -4 (nom normalisé)
      row(3, 'Riz', '10'),           // écart 0
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.counted).toBe(2);
    expect(res.report!.rejects).toHaveLength(0);
    const castelGap = res.report!.gaps.find((g) => g.productId === castel.id);
    expect(castelGap).toMatchObject({ qtyTheoretical: 24, qtyCounted: 20, gap: -4, gapValue: -2600 });
    const movements = await db.select().from(stockMovements).where(and(
      eq(stockMovements.type, 'ajustement_inventaire'),
      eq(stockMovements.productId, castel.id!),
    ));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].qty)).toBe(-4);
  });
  it('produit introuvable : rejet avec suggestion, les autres lignes passent', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const plantain = await saveProduct(db, { name: 'Plantain', baseUnit: 'kg', purchasePrice: 800 });
    await giveStock(db, plantain.id!, bar.id, 5, admin.id);
    const res = await importInventory(db, [
      row(2, 'Plantin', '3'),   // faute -> suggestion
      row(3, 'Plantain', '4'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.counted).toBe(1);
    expect(res.report!.rejects).toHaveLength(1);
    expect(res.report!.rejects[0].reason).toContain('Plantain'); // « vouliez-vous … »
  });
  it('quantités : négative et non numérique rejetées, zéro valide (compté à zéro)', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await giveStock(db, riz.id!, bar.id, 8, admin.id);
    const res = await importInventory(db, [
      row(2, 'Riz', '0'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.gaps[0]).toMatchObject({ qtyCounted: 0, gap: -8 });
    const res2 = await importInventory(db, [
      row(2, 'Riz', '-1'),
      row(3, 'Riz', 'abc'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res2.ok).toBe(false);
    expect(res2.report!.rejects).toHaveLength(2);
  });
  it('doublon interne : la dernière ligne fait foi, duplicates incrémenté', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await giveStock(db, riz.id!, bar.id, 8, admin.id);
    const res = await importInventory(db, [
      row(2, 'Riz', '5'),
      row(3, 'riz', '6'), // dernière fait foi
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.duplicates).toBe(1);
    expect(res.report!.counted).toBe(1);
    expect(res.report!.gaps[0]).toMatchObject({ qtyCounted: 6, gap: -2 });
  });
  it('zéro ligne valide : ok:false mais le rapport expose les rejets', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const res = await importInventory(db, [
      row(2, 'Inconnu', '5'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Aucune ligne');
    expect(res.report!.rejects).toHaveLength(1);
  });
  it('produit archivé compté : accepté', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const vieux = await saveProduct(db, { name: 'Vieux Produit', baseUnit: 'kg', purchasePrice: 100 });
    await giveStock(db, vieux.id!, bar.id, 3, admin.id);
    await archiveProduct(db, vieux.id!, true);
    const res = await importInventory(db, [
      row(2, 'Vieux Produit', '2'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.gaps[0]).toMatchObject({ qtyCounted: 2, gap: -1 });
  });
});
