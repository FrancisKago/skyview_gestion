import { and, eq, inArray } from 'drizzle-orm';
import { orders, orderLines, products, stockMovements } from '@/db/schema';
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
  const found = await db.select({ id: products.id, name: products.name, active: products.active })
    .from(products).where(inArray(products.id, productIds));
  if (found.length !== productIds.length) {
    return { ok: false, error: 'Produit inconnu dans la commande' };
  }
  // Garde serveur (spec durcissement §4) : l'UI filtre déjà les inactifs,
  // ceci bloque les POST forgés.
  const inactive = found.find((p: { active: boolean }) => !p.active);
  if (inactive) return { ok: false, error: `Produit désactivé : « ${inactive.name} »` };
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

export interface ReceiveOrderInput {
  orderId: number;
  receivedBy: number;
  locationId: number | null;
  lines: Array<{ productId: number; qtyReceived: number }>;
}

// Compromis assumés v1 (documentés, non bloquants), même logique que deliverOrder ci-dessus :
// - TOCTOU : la vérification du statut et les écritures ne sont pas enveloppées dans une
//   transaction ; deux réceptions strictement simultanées pourraient toutes deux passer le
//   contrôle "livree". Acceptable pour un seul barman/cuisinier par emplacement à la fois.
//   La garde d'idempotence ci-dessous limite le pire cas au doublon de statut, pas de stock.
// - Réception à zéro : qtyReceived = 0 sur toutes les lignes est acceptée (rien reçu du tout) ;
//   la commande passe "receptionnee" sans qu'aucun mouvement de stock ne soit créé.
export async function receiveOrder(db: AnyDb, input: ReceiveOrderInput):
  Promise<{ ok: boolean; error?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) return { ok: false, error: 'Commande introuvable' };
  if (order.status !== 'livree') {
    return { ok: false, error: "Cette commande n'est pas en attente de réception" };
  }
  // Un barman/cuisinier ne peut réceptionner que les commandes de son propre emplacement.
  // locationId null = pas de restriction : atteignable uniquement depuis du code serveur
  // (l'action de /receptions refuse en amont toute session sans emplacement).
  if (input.locationId != null && order.locationId !== input.locationId) {
    return { ok: false, error: 'Cette commande ne concerne pas votre emplacement' };
  }
  // Fusion des doublons AVANT validation et écritures (dernière valeur retenue) : sans
  // cela, deux lignes pour le même produit passeraient le contrôle d'ensembles ci-dessous
  // et créeraient DEUX mouvements, alors que la boucle d'update d'orderLines n'en garderait
  // qu'une — stock gonflé silencieusement. "Dernière valeur retenue" pour rester cohérent
  // avec cette boucle d'update, où la dernière écriture gagne.
  const byProduct = new Map<number, number>();
  for (const l of input.lines) byProduct.set(l.productId, l.qtyReceived);
  // Rejette les quantités négatives ET non finies (NaN/Infinity forgées) AVANT toute
  // écriture : cf. convention de src/lib/orders.ts#deliverOrder.
  if ([...byProduct.values()].some((q) => !Number.isFinite(q) || q < 0)) {
    return { ok: false, error: 'Les quantités reçues ne peuvent pas être négatives' };
  }
  // Correspondance EXACTE avec les lignes de la commande : cf. deliverOrder ci-dessus.
  const existing: Array<{ productId: number }> =
    await db.select({ productId: orderLines.productId }).from(orderLines)
      .where(eq(orderLines.orderId, input.orderId));
  const expectedIds = new Set(existing.map((l) => l.productId));
  if (expectedIds.size !== byProduct.size
    || [...expectedIds].some((id) => !byProduct.has(id))) {
    return { ok: false, error: 'Lignes de réception incohérentes avec la commande' };
  }
  for (const [productId, qtyReceived] of byProduct) {
    await db.update(orderLines)
      .set({ qtyReceived: String(qtyReceived) })
      .where(and(eq(orderLines.orderId, input.orderId), eq(orderLines.productId, productId)));
  }
  // C'est ICI que le stock bouge (règle métier : à la confirmation, pas à la livraison).
  const movements = [...byProduct.entries()].filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({
      productId, locationId: order.locationId, type: 'reception' as const,
      qty: String(qty), refType: 'order', refId: order.id, userId: input.receivedBy,
    }));
  // Garde d'idempotence (sans transaction) : les mouvements sont insérés AVANT le passage
  // du statut à "receptionnee". Si ce passage échouait puis que l'utilisateur réessayait,
  // une seconde insertion doublerait le stock. On vérifie donc qu'aucun mouvement
  // 'reception' n'existe déjà pour cette commande : s'il y en a, un essai précédent les a
  // déjà écrits ; on saute l'insert mais on termine quand même le changement de statut.
  // (Les Tâches 16/18 — sorties de service et inventaire — reprendront cette même garde.)
  const [alreadyRecorded] = await db.select({ id: stockMovements.id }).from(stockMovements)
    .where(and(
      eq(stockMovements.type, 'reception'),
      eq(stockMovements.refType, 'order'),
      eq(stockMovements.refId, order.id),
    )).limit(1);
  // drizzle jette une erreur sur .values([]) : on saute aussi l'insert si tout est à zéro.
  if (!alreadyRecorded && movements.length) {
    await db.insert(stockMovements).values(movements);
  }
  await db.update(orders)
    .set({ status: 'receptionnee', receivedBy: input.receivedBy, receivedAt: new Date() })
    .where(eq(orders.id, input.orderId));
  return { ok: true };
}
