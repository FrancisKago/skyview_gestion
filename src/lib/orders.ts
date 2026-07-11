import { inArray } from 'drizzle-orm';
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
