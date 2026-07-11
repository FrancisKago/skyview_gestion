import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { getLocationStock, getProductStock } from '@/lib/stock';
import { stockMovements } from '@/db/schema';

describe('getLocationStock', () => {
  it('somme les mouvements par produit pour un emplacement', async () => {
    const db = await createTestDb();
    const { bar, cuisine, barman } = await seedBase(db);
    const castel = await saveProduct(db, {
      name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650, alertThreshold: 10,
    });
    await db.insert(stockMovements).values([
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: '24', userId: barman.id },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: '-10', userId: barman.id },
      // mouvement d'un AUTRE emplacement : ne doit pas compter
      { productId: castel.id!, locationId: cuisine.id, type: 'reception', qty: '5', userId: barman.id },
    ]);
    const stock = await getLocationStock(db, bar.id);
    expect(stock).toEqual([{
      productId: castel.id, name: 'Castel', baseUnit: 'bouteille',
      qty: 14, value: 14 * 650, alertThreshold: 10, belowThreshold: false,
    }]);
  });

  it('signale le passage sous le seuil et les stocks négatifs', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, {
      name: 'Guinness', baseUnit: 'bouteille', purchasePrice: 800, alertThreshold: 10,
    });
    await db.insert(stockMovements).values([
      { productId: p.id!, locationId: bar.id, type: 'reception', qty: '5', userId: barman.id },
      { productId: p.id!, locationId: bar.id, type: 'sortie_service', qty: '-8', userId: barman.id },
    ]);
    const [row] = await getLocationStock(db, bar.id);
    expect(row.qty).toBe(-3);
    expect(row.belowThreshold).toBe(true);
  });
});

describe('getProductStock', () => {
  it('renvoie la quantité théorique d\'un produit à un emplacement', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, {
      name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650, alertThreshold: 10,
    });
    await db.insert(stockMovements).values([
      { productId: p.id!, locationId: bar.id, type: 'reception', qty: '24', userId: barman.id },
      { productId: p.id!, locationId: bar.id, type: 'sortie_service', qty: '-10', userId: barman.id },
    ]);
    const qty = await getProductStock(db, bar.id, p.id!);
    expect(qty).toBe(14);
  });

  it('renvoie 0 pour un produit sans mouvement', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const unknownProductId = 999999;
    const qty = await getProductStock(db, bar.id, unknownProductId);
    expect(qty).toBe(0);
  });
});
