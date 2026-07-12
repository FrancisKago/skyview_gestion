import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder } from '@/lib/orders';
import { getFrequentProducts } from '@/lib/frequent-products';
import { stockMovements } from '@/db/schema';

describe('getFrequentProducts', () => {
  it("compte les sorties de service et les lignes de commandes des 30 derniers jours pour l'emplacement", async () => {
    const db = await createTestDb();
    const { bar, cuisine, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await db.insert(stockMovements).values([
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: '-2', userId: barman.id },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: '-1', userId: barman.id },
      // sortie CUISINE : ne compte pas pour le bar
      { productId: castel.id!, locationId: cuisine.id, type: 'sortie_service', qty: '-5', userId: barman.id },
      // réception : ne compte pas (seul sortie_service compte côté mouvements)
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: '10', userId: barman.id },
    ]);
    await createOrder(db, { locationId: bar.id, createdBy: barman.id, lines: [{ productId: riz.id!, qtyRequested: 5 }] });

    const freq = await getFrequentProducts(db, bar.id);
    expect(freq.get(castel.id!)).toBe(2);
    expect(freq.get(riz.id!)).toBe(1);
  });
  it("mouvement vieux de plus de 30 jours : ignoré", async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Vieux', baseUnit: 'u', purchasePrice: 100 });
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    await db.insert(stockMovements).values({
      productId: p.id!, locationId: bar.id, type: 'sortie_service', qty: '-1', userId: barman.id, createdAt: old,
    });
    const freq = await getFrequentProducts(db, bar.id);
    expect(freq.get(p.id!)).toBeUndefined();
  });
});
