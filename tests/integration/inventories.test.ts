import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { validateInventory } from '@/lib/inventories';
import { getLocationStock } from '@/lib/stock';
import { stockMovements, inventories, inventoryLines } from '@/db/schema';

describe('validateInventory', () => {
  it("enregistre l'inventaire, calcule les écarts et ajuste le stock", async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'reception', qty: '24', userId: barman.id,
    });
    // Théorique 24, compté 21 -> écart -3, valorisé -1950 FCFA
    const res = await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: castel.id!, qtyCounted: 21 }],
    });
    expect(res.ok).toBe(true);
    expect(res.gaps).toEqual([{
      productId: castel.id, name: 'Castel', qtyTheoretical: 24, qtyCounted: 21,
      gap: -3, gapValue: -1950,
    }]);
    // Le stock est ajusté au réel
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(21);
    // L'inventaire et ses lignes sont historisés
    const [inv] = await db.select().from(inventories);
    expect(inv.status).toBe('valide');
    const [line] = await db.select().from(inventoryLines).where(eq(inventoryLines.inventoryId, inv.id));
    expect(Number(line.qtyTheoretical)).toBe(24);
    expect(Number(line.qtyCounted)).toBe(21);
  });

  it("un produit non compté n'est pas ajusté ; écart nul ne crée pas de mouvement", async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await db.insert(stockMovements).values({
      productId: p.id!, locationId: bar.id, type: 'reception', qty: '10', userId: barman.id,
    });
    await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: p.id!, qtyCounted: 10 }], // écart nul
    });
    const mvts = await db.select().from(stockMovements)
      .where(eq(stockMovements.type, 'ajustement_inventaire'));
    expect(mvts).toHaveLength(0);
  });

  it('fusionne les lignes en double du même produit (dernière valeur retenue)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'reception', qty: '24', userId: barman.id,
    });
    const res = await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: castel.id!, qtyCounted: 20 }, { productId: castel.id!, qtyCounted: 21 }],
    });
    expect(res.ok).toBe(true);
    expect(res.gaps).toHaveLength(1);
    expect(res.gaps![0].qtyCounted).toBe(21);
    const lines = await db.select().from(inventoryLines);
    expect(lines).toHaveLength(1);
    const mvts = await db.select().from(stockMovements)
      .where(eq(stockMovements.type, 'ajustement_inventaire'));
    expect(mvts).toHaveLength(1);
    expect(Number(mvts[0].qty)).toBe(-3);
  });

  it('refuse une quantité comptée non finie (NaN)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: castel.id!, qtyCounted: NaN }],
    });
    expect(res.ok).toBe(false);
  });

  it('refuse un produit inconnu dans l\'inventaire', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const res = await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: 999999, qtyCounted: 5 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('inconnu');
  });

  it('refuse une date d\'inventaire invalide', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-02-31', countedBy: barman.id,
      lines: [{ productId: castel.id!, qtyCounted: 5 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Date');
  });

  it('les mouvements générés ont les bons champs (type, refType, refId, qty signée)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'reception', qty: '10', userId: barman.id,
    });
    const res = await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: castel.id!, qtyCounted: 15 }],
    });
    expect(res.ok).toBe(true);
    const [inv] = await db.select().from(inventories);
    const [mvt] = await db.select().from(stockMovements)
      .where(eq(stockMovements.type, 'ajustement_inventaire'));
    expect(mvt.refType).toBe('inventory');
    expect(mvt.refId).toBe(inv.id);
    expect(Number(mvt.qty)).toBe(5);
    expect(mvt.productId).toBe(castel.id);
    expect(mvt.locationId).toBe(bar.id);
    expect(mvt.userId).toBe(barman.id);
  });
});
