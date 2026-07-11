import { and, eq, inArray } from 'drizzle-orm';
import { orders, orderLines, products } from '@/db/schema';
import type { AnyDb } from '@/db';
import { round3 } from '@/lib/units';

export interface CreateOrderInput {
  locationId: number;
  createdBy: number;
  lines: Array<{ productId: number; qtyRequested: number }>;
}

export async function createOrder(db: AnyDb, input: CreateOrderInput):
  Promise<{ ok: boolean; id?: number; error?: string }> {
  const lines = input.lines.filter((l) => l.productId);
  if (!lines.length) return { ok: false, error: 'La commande doit contenir au moins un produit' };
  if (lines.some((l) => !Number.isFinite(l.qtyRequested) || !(l.qtyRequested > 0))) {
    return { ok: false, error: 'Toutes les quantités doivent être positives' };
  }
  // Vérification d'existence des produits AVANT toute écriture (cf. src/lib/sale-articles.ts) :
  // sans elle, la contrainte FK de order_lines ne claquerait qu'APRÈS l'insert de la commande,
  // laissant une commande orpheline sans lignes.
  // Fusion des doublons : deux lignes pour le même produit sont additionnées.
  // Sans cela, deux order_lines partageraient le même (orderId, productId) et
  // les mises à jour par produit des Tâches 14-15 (livraison/réception) en
  // écraseraient silencieusement une.
  const byProduct = new Map<number, number>();
  for (const l of lines) {
    byProduct.set(l.productId, round3((byProduct.get(l.productId) ?? 0) + l.qtyRequested));
  }
  const productIds = [...byProduct.keys()];
  const found = await db.select({ id: products.id }).from(products)
    .where(inArray(products.id, productIds));
  if (found.length !== productIds.length) {
    return { ok: false, error: 'Produit inconnu dans la commande' };
  }
  const [order] = await db.insert(orders)
    .values({ locationId: input.locationId, createdBy: input.createdBy })
    .returning();
  await db.insert(orderLines).values(
    [...byProduct.entries()].map(([productId, qtyRequested]) => ({
      orderId: order.id, productId, qtyRequested: String(qtyRequested),
    })),
  );
  return { ok: true, id: order.id };
}

export interface DeliverOrderInput {
  orderId: number;
  deliveredBy: number;
  lines: Array<{ productId: number; qtyDelivered: number }>;
}

// Compromis assumés v1 (documentés, non bloquants) :
// - TOCTOU : la vérification du statut et les écritures ne sont pas enveloppées dans une
//   transaction ; deux livraisons strictement simultanées pourraient toutes deux passer le
//   contrôle "en_attente". Acceptable pour un seul magasinier ; à revoir si multi-utilisateurs.
// - Livraison à zéro : qtyDelivered = 0 sur toutes les lignes est accepté (commande "livrée
//   vide") ; l'écart demandé/livré reste visible et la réception (Tâche 15) fait foi.
export async function deliverOrder(db: AnyDb, input: DeliverOrderInput):
  Promise<{ ok: boolean; error?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) return { ok: false, error: 'Commande introuvable' };
  if (order.status !== 'en_attente') {
    return { ok: false, error: 'Cette commande a déjà été livrée' };
  }
  // Rejette les quantités négatives ET non finies (NaN/Infinity forgées) AVANT toute
  // écriture : cf. convention de src/lib/products.ts / src/lib/orders.ts#createOrder.
  if (input.lines.some((l) => !Number.isFinite(l.qtyDelivered) || l.qtyDelivered < 0)) {
    return { ok: false, error: 'Les quantités livrées ne peuvent pas être négatives' };
  }
  // Correspondance EXACTE avec les lignes de la commande : ni ligne omise (elle resterait
  // silencieusement à qtyDelivered NULL alors que la commande passerait "livree"), ni produit
  // étranger (l'update ne toucherait aucune ligne et la quantité serait perdue sans erreur).
  // createOrder garantit une ligne par produit, la comparaison d'ensembles suffit donc.
  const existing: Array<{ productId: number }> =
    await db.select({ productId: orderLines.productId }).from(orderLines)
      .where(eq(orderLines.orderId, input.orderId));
  const expectedIds = new Set(existing.map((l) => l.productId));
  const submittedIds = new Set(input.lines.map((l) => l.productId));
  if (expectedIds.size !== submittedIds.size
    || [...expectedIds].some((id) => !submittedIds.has(id))) {
    return { ok: false, error: 'Lignes de livraison incohérentes avec la commande' };
  }
  for (const line of input.lines) {
    await db.update(orderLines)
      .set({ qtyDelivered: String(line.qtyDelivered) })
      .where(and(eq(orderLines.orderId, input.orderId), eq(orderLines.productId, line.productId)));
  }
  await db.update(orders)
    .set({ status: 'livree', deliveredBy: input.deliveredBy, deliveredAt: new Date() })
    .where(eq(orders.id, input.orderId));
  return { ok: true };
}
