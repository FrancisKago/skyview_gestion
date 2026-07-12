import { and, eq, gte, sql } from 'drizzle-orm';
import { stockMovements, orders, orderLines } from '@/db/schema';
import type { AnyDb } from '@/db';

// Fréquence d'utilisation par produit à un emplacement sur 30 jours glissants :
// nombre de mouvements 'sortie_service' + nombre de lignes de commandes. Spec §6.2.
export async function getFrequentProducts(db: AnyDb, locationId: number): Promise<Map<number, number>> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const exits: Array<{ productId: number; n: string }> = await db.select({
    productId: stockMovements.productId, n: sql<string>`count(*)`,
  }).from(stockMovements)
    .where(and(
      eq(stockMovements.locationId, locationId),
      eq(stockMovements.type, 'sortie_service'),
      gte(stockMovements.createdAt, since),
    ))
    .groupBy(stockMovements.productId);
  const orderedLines: Array<{ productId: number; n: string }> = await db.select({
    productId: orderLines.productId, n: sql<string>`count(*)`,
  }).from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .where(and(eq(orders.locationId, locationId), gte(orders.createdAt, since)))
    .groupBy(orderLines.productId);
  const freq = new Map<number, number>();
  for (const r of [...exits, ...orderedLines]) {
    freq.set(r.productId, (freq.get(r.productId) ?? 0) + Number(r.n));
  }
  return freq;
}
