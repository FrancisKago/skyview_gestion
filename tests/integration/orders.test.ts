import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder, deliverOrder } from '@/lib/orders';
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

  it('fusionne les lignes en doublon sur le même produit', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [
        { productId: p.id!, qtyRequested: 12 },
        { productId: p.id!, qtyRequested: 24 },
      ],
    });
    expect(res.ok).toBe(true);
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, res.id!));
    expect(lines).toHaveLength(1);
    expect(Number(lines[0].qtyRequested)).toBe(36);
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

describe('deliverOrder', () => {
  it('enregistre les quantités livrées et passe la commande en "livree"', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, {
      name: 'Castel', baseUnit: 'bouteille', packName: 'casier', packSize: 12, purchasePrice: 650,
    });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: castel.id!, qtyRequested: 36 }],
    });
    // Le magasinier livre 2 casiers + 5 bouteilles = 29 (écart vs 36 demandées)
    const res = await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id,
      lines: [{ productId: castel.id!, qtyDelivered: 29 }],
    });
    expect(res.ok).toBe(true);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('livree');
    expect(o.deliveredBy).toBe(magasinier.id);
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id!));
    expect(Number(lines[0].qtyDelivered)).toBe(29);
  });

  it('refuse de livrer une commande déjà livrée', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    const again = await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    expect(again.ok).toBe(false); // protection double soumission
  });

  it('refuse une commande introuvable', async () => {
    const db = await createTestDb();
    const { magasinier } = await seedBase(db);
    const res = await deliverOrder(db, {
      orderId: 999999, deliveredBy: magasinier.id, lines: [],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Commande introuvable');
  });

  it('refuse une quantité livrée négative ou non finie', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    const negative = await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: -1 }],
    });
    expect(negative.ok).toBe(false);
    const nonFinite = await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: NaN }],
    });
    expect(nonFinite.ok).toBe(false);
    // La commande n'a pas été modifiée par les tentatives refusées
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('en_attente');
  });
});
