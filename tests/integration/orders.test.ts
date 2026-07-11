import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder, deliverOrder, receiveOrder } from '@/lib/orders';
import { orders, orderLines, stockMovements } from '@/db/schema';
import { getLocationStock } from '@/lib/stock';
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

  it('refuse une livraison qui omet une ligne de la commande', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [
        { productId: castel.id!, qtyRequested: 12 },
        { productId: riz.id!, qtyRequested: 5 },
      ],
    });
    // Une seule ligne soumise sur les deux de la commande → refus, rien n'est écrit
    const res = await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id,
      lines: [{ productId: castel.id!, qtyDelivered: 12 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Lignes de livraison incohérentes avec la commande');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('en_attente');
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id!));
    expect(lines.every((l) => l.qtyDelivered === null)).toBe(true);
  });

  it('refuse une livraison contenant un produit étranger à la commande', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: castel.id!, qtyRequested: 12 }],
    });
    const res = await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id,
      lines: [
        { productId: castel.id!, qtyDelivered: 12 },
        { productId: riz.id!, qtyDelivered: 3 }, // pas dans la commande
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Lignes de livraison incohérentes avec la commande');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('en_attente');
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

describe('receiveOrder', () => {
  it("crée les mouvements 'reception' et met à jour le stock à la confirmation", async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: castel.id!, qtyRequested: 36 }],
    });
    await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: castel.id!, qtyDelivered: 29 }],
    });
    // Avant réception : stock inchangé (règle métier n°2 de la spec)
    expect(await getLocationStock(db, bar.id)).toEqual([]);
    // Le barman confirme 28 (1 bouteille cassée : écart livré/reçu)
    const res = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: castel.id!, qtyReceived: 28 }],
    });
    expect(res.ok).toBe(true);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(28);
    const [mvt] = await db.select().from(stockMovements);
    expect(mvt.type).toBe('reception');
    expect(mvt.refType).toBe('order');
    expect(mvt.refId).toBe(order.id);
    expect(mvt.userId).toBe(barman.id);
  });

  it('refuse une réception sur une commande non livrée ou déjà réceptionnée', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    expect((await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: 5 }],
    })).ok).toBe(false);
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    await receiveOrder(db, { orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: 5 }] });
    expect((await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: 5 }],
    })).ok).toBe(false);
  });

  it('refuse une quantité reçue non finie ou négative', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    const negative = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: -1 }],
    });
    expect(negative.ok).toBe(false);
    const nonFinite = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: NaN }],
    });
    expect(nonFinite.ok).toBe(false);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('livree');
  });

  it('refuse une réception dont les lignes ne correspondent pas exactement à la commande', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [
        { productId: castel.id!, qtyRequested: 12 },
        { productId: riz.id!, qtyRequested: 5 },
      ],
    });
    await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id,
      lines: [
        { productId: castel.id!, qtyDelivered: 12 },
        { productId: riz.id!, qtyDelivered: 5 },
      ],
    });
    // Ligne omise → refus, rien n'est écrit
    const res = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id,
      lines: [{ productId: castel.id!, qtyReceived: 12 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Lignes de réception incohérentes avec la commande');
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('livree');
    const movements = await db.select().from(stockMovements);
    expect(movements).toHaveLength(0);
  });

  it('accepte une réception entièrement à zéro sans créer de mouvement', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    const res = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: 0 }],
    });
    expect(res.ok).toBe(true);
    const movements = await db.select().from(stockMovements);
    expect(movements).toHaveLength(0);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('receptionnee');
  });

  it('fusionne les lignes en doublon sur le même produit (pas de mouvement double)', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: castel.id!, qtyRequested: 36 }],
    });
    await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: castel.id!, qtyDelivered: 29 }],
    });
    // Deux lignes forgées pour le même produit : une seule doit compter (la dernière),
    // sinon le stock serait gonflé à 56.
    const res = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id,
      lines: [
        { productId: castel.id!, qtyReceived: 28 },
        { productId: castel.id!, qtyReceived: 28 },
      ],
    });
    expect(res.ok).toBe(true);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(28);
    const movements = await db.select().from(stockMovements);
    expect(movements).toHaveLength(1);
  });

  it("ne réinsère pas de mouvements si un essai précédent les a déjà écrits (idempotence)", async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    // Simule un essai précédent interrompu APRÈS l'insert des mouvements mais AVANT le
    // passage du statut : le mouvement existe déjà, la commande est toujours "livree".
    await db.insert(stockMovements).values({
      productId: p.id!, locationId: bar.id, type: 'reception',
      qty: '5', refType: 'order', refId: order.id!, userId: barman.id,
    });
    const res = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: 5 }],
    });
    expect(res.ok).toBe(true);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('receptionnee');
    // Aucun mouvement supplémentaire : le stock reste à 5, pas 10.
    const movements = await db.select().from(stockMovements);
    expect(movements).toHaveLength(1);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(5);
  });

  it("refuse la réception si l'emplacement de l'utilisateur ne correspond pas à celui de la commande", async () => {
    const db = await createTestDb();
    const { bar, cuisine, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: cuisine.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    const res = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, locationId: bar.id, lines: [{ productId: p.id!, qtyReceived: 5 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Cette commande ne concerne pas votre emplacement');
  });
});
