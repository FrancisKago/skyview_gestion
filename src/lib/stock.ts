import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
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

// NB : un produit sans AUCUN mouvement à l'emplacement est absent du résultat
// (jamais bougé ≠ zéro après consommation : un produit reçu puis entièrement
// consommé apparaît bien avec qty 0).
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
      // L'alerte se déclenche AU seuil ou en dessous (décision produit).
      belowThreshold: threshold != null && qty <= threshold,
    };
  });
}

export interface CatalogLine extends StockLine {
  active: boolean;
}

// Catalogue de l'emplacement (page Mon stock) : TOUS les produits actifs, même
// sans aucun mouvement (qty 0), plus les produits archivés ayant bougé à
// l'emplacement (physiquement encore là — badge « archivé » côté UI). Ne
// remplace PAS getLocationStock : sa sémantique « jamais bougé = absent »
// alimente l'inventaire et la compta, elle est inchangée.
export async function getLocationCatalog(db: AnyDb, locationId: number): Promise<CatalogLine[]> {
  const rows = await db.select({
    productId: products.id,
    name: products.name,
    baseUnit: products.baseUnit,
    purchasePrice: products.purchasePrice,
    alertThreshold: products.alertThreshold,
    active: products.active,
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  })
    .from(products)
    .leftJoin(stockMovements, and(
      eq(stockMovements.productId, products.id),
      eq(stockMovements.locationId, locationId),
    ))
    // WHERE avant agrégation : un archivé n'est gardé que si au moins une de
    // ses lignes jointes porte un mouvement de l'emplacement.
    .where(or(eq(products.active, true), isNotNull(stockMovements.id)))
    .groupBy(products.id, products.name, products.baseUnit, products.purchasePrice,
      products.alertThreshold, products.active)
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
      // Même règle que getLocationStock : alerte AU seuil ou en dessous.
      belowThreshold: threshold != null && qty <= threshold,
      active: r.active,
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
