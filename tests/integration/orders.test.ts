import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder } from '@/lib/orders';
import { orders, orderLines } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('createOrder', () => {
  it('crée une commande en attente avec ses lignes', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: castel.id!, qtyRequested: 36 }],
    });
    expect(res.ok).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.id, res.id!));
    expect(order.status).toBe('en_attente');
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, res.id!));
    expect(Number(lines[0].qtyRequested)).toBe(36);
    expect(lines[0].qtyDelivered).toBeNull();
  });

  it('refuse une commande vide ou avec quantité nulle', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    expect((await createOrder(db, { locationId: bar.id, createdBy: barman.id, lines: [] })).ok).toBe(false);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 0 }],
    })).ok).toBe(false);
  });

  it('refuse une quantité non finie ou négative', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: NaN }],
    })).ok).toBe(false);
    expect((await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: -5 }],
    })).ok).toBe(false);
  });

  it('refuse un produit inconnu', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: 999999, qtyRequested: 5 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Produit inconnu dans la commande');
  });
});
