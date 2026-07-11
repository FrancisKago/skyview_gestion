import { and, eq, sql } from 'drizzle-orm';
import { stockMovements, products } from '@/db/schema';
import { round3 } from './units';
import type { AnyDb } from '@/db';

export interface StockLine {
  productId: number;
  name: string;
  baseUnit: string;
  qty: number;
  value: number; // FCFA
  alertThreshold: number | null;
  belowThreshold: boolean;
}

export async function getLocationStock(db: AnyDb, locationId: number): Promise<StockLine[]> {
  const rows = await db.select({
    productId: products.id,
    name: products.name,
    baseUnit: products.baseUnit,
    purchasePrice: products.purchasePrice,
    alertThreshold: products.alertThreshold,
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(eq(stockMovements.locationId, locationId))
    .groupBy(products.id, products.name, products.baseUnit, products.purchasePrice, products.alertThreshold)
    .orderBy(products.name);

  return rows.map((r: typeof rows[number]) => {
    const qty = round3(Number(r.qty));
    const threshold = r.alertThreshold != null ? Number(r.alertThreshold) : null;
    return {
      productId: r.productId,
      name: r.name,
      baseUnit: r.baseUnit,
      qty,
      value: Math.round(qty * r.purchasePrice),
      alertThreshold: threshold,
      belowThreshold: threshold != null && qty < threshold,
    };
  });
}

// Quantité théorique d'UN produit à un emplacement (utilisé par l'inventaire).
export async function getProductStock(db: AnyDb, locationId: number, productId: number): Promise<number> {
  const [row] = await db.select({
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  }).from(stockMovements)
    .where(and(eq(stockMovements.locationId, locationId), eq(stockMovements.productId, productId)));
  return round3(Number(row?.qty ?? 0));
}
