import { and, asc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';
import { stockMovements, products, users } from '@/db/schema';
import { round3 } from './units';
import { MOVEMENT_LABELS } from './movement-labels';
import type { AnyDb } from '@/db';

export interface MovementReportLine {
  productId: number; name: string; baseUnit: string;
  initial: number; receptions: number; sorties: number; ajustements: number; final: number;
  initialValue: number; finalValue: number; // FCFA
  receptionsValue: number; sortiesValue: number; ajustementsValue: number; // FCFA
}

export interface MovementDetailLine {
  createdAt: Date; type: string; typeLabel: string;
  qty: number; reason: string | null; userName: string;
}

// Bornes en jours pleins : « du » à 00:00:00 inclus, « au » à 23:59:59.999 inclus
// (createdAt est un timestamp ; le comptable raisonne en jours). Datation par
// createdAt (moment de l'écriture), pas serviceDate — réalité du journal, spec §3.1.
function dayStart(d: string): Date { return new Date(`${d}T00:00:00`); }
function dayEnd(d: string): Date { return new Date(`${d}T23:59:59.999`); }

// Rapport par produit sur une période : initial (somme avant), mouvements de la
// période ventilés par type, final DÉRIVÉ (pas de 3e requête). Un produit apparaît
// s'il a bougé avant OU pendant la période (même sémantique que getLocationStock :
// consommé à zéro -> présent, jamais bougé -> absent). Spec §3.1.
export async function getMovementReport(db: AnyDb, opts: {
  from: string; to: string; locationId: number; productIds?: number[];
}): Promise<MovementReportLine[]> {
  if (opts.productIds && opts.productIds.length === 0) return []; // inArray([]) interdit par drizzle
  const filters: SQL[] = [eq(stockMovements.locationId, opts.locationId)];
  if (opts.productIds) filters.push(inArray(stockMovements.productId, opts.productIds));

  const before: Array<{ productId: number; qty: string }> = await db.select({
    productId: stockMovements.productId,
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  }).from(stockMovements)
    .where(and(...filters, lt(stockMovements.createdAt, dayStart(opts.from))))
    .groupBy(stockMovements.productId);

  const during: Array<{ productId: number; type: string; qty: string }> = await db.select({
    productId: stockMovements.productId,
    type: stockMovements.type,
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  }).from(stockMovements)
    .where(and(...filters,
      gte(stockMovements.createdAt, dayStart(opts.from)),
      lte(stockMovements.createdAt, dayEnd(opts.to))))
    .groupBy(stockMovements.productId, stockMovements.type);

  const byProduct = new Map<number, { initial: number; receptions: number; sorties: number; ajustements: number }>();
  const entry = (id: number) => {
    if (!byProduct.has(id)) byProduct.set(id, { initial: 0, receptions: 0, sorties: 0, ajustements: 0 });
    return byProduct.get(id)!;
  };
  for (const b of before) entry(b.productId).initial = round3(Number(b.qty));
  for (const d of during) {
    const e = entry(d.productId);
    const q = Number(d.qty);
    if (d.type === 'reception') e.receptions = round3(e.receptions + q);
    else if (d.type === 'sortie_service') e.sorties = round3(e.sorties + Math.abs(q));
    else e.ajustements = round3(e.ajustements + q); // inventaire + admin, signés (spec : une colonne)
  }
  if (byProduct.size === 0) return [];

  const infos: Array<{ id: number; name: string; baseUnit: string; purchasePrice: number }> =
    await db.select({
      id: products.id, name: products.name,
      baseUnit: products.baseUnit, purchasePrice: products.purchasePrice,
    }).from(products).where(inArray(products.id, [...byProduct.keys()]));
  const infoById = new Map(infos.map((p) => [p.id, p]));

  return [...byProduct.entries()]
    .map(([productId, e]) => {
      const info = infoById.get(productId)!;
      const final = round3(e.initial + e.receptions - e.sorties + e.ajustements);
      return {
        productId, name: info.name, baseUnit: info.baseUnit,
        initial: e.initial, receptions: e.receptions, sorties: e.sorties,
        ajustements: e.ajustements, final,
        initialValue: Math.round(e.initial * info.purchasePrice),
        finalValue: Math.round(final * info.purchasePrice),
        receptionsValue: Math.round(e.receptions * info.purchasePrice),
        sortiesValue: Math.round(e.sorties * info.purchasePrice),
        ajustementsValue: Math.round(e.ajustements * info.purchasePrice),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// Journal chronologique d'UN produit sur la période (détail sous la synthèse).
export async function getMovementDetail(db: AnyDb, opts: {
  from: string; to: string; locationId: number; productId: number;
}): Promise<MovementDetailLine[]> {
  const rows: Array<{ createdAt: Date; type: string; qty: string; reason: string | null; userName: string }> =
    await db.select({
      createdAt: stockMovements.createdAt, type: stockMovements.type,
      qty: stockMovements.qty, reason: stockMovements.reason, userName: users.name,
    }).from(stockMovements)
      .innerJoin(users, eq(stockMovements.userId, users.id))
      .where(and(
        eq(stockMovements.locationId, opts.locationId),
        eq(stockMovements.productId, opts.productId),
        gte(stockMovements.createdAt, dayStart(opts.from)),
        lte(stockMovements.createdAt, dayEnd(opts.to))))
      .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));
  return rows.map((r) => ({
    createdAt: r.createdAt, type: r.type,
    typeLabel: MOVEMENT_LABELS[r.type] ?? r.type,
    qty: round3(Number(r.qty)), reason: r.reason, userName: r.userName,
  }));
}
