import { eq, sql } from 'drizzle-orm';
import {
  products, recipeLines, orderLines, stockMovements, serviceExitLines, inventoryLines,
} from '@/db/schema';
import type { AnyDb } from '@/db';

export interface ProductInput {
  id?: number;
  name: string;
  category?: string;
  baseUnit: string;
  packName?: string | null;
  packSize?: number | null;
  purchasePrice: number;
  alertThreshold?: number | null;
  active?: boolean;
}

export async function saveProduct(db: AnyDb, input: ProductInput):
  Promise<{ ok: boolean; id?: number; error?: string }> {
  // Normalisation AVANT validation : un packName composé d'espaces doit être
  // traité comme absent par la règle XOR ci-dessous.
  const name = input.name?.trim() ?? '';
  const baseUnit = input.baseUnit?.trim() ?? '';
  const packName = input.packName?.trim() || null;

  if (!name) return { ok: false, error: 'Le nom est obligatoire' };
  if (!baseUnit) return { ok: false, error: "L'unité de base est obligatoire" };
  if (!Number.isFinite(input.purchasePrice)) {
    return { ok: false, error: 'Le prix doit être un nombre' };
  }
  if (input.purchasePrice < 0) return { ok: false, error: 'Le prix ne peut pas être négatif' };
  if (input.packSize != null && !Number.isFinite(input.packSize)) {
    return { ok: false, error: 'La taille du conditionnement doit être un nombre' };
  }
  if (input.alertThreshold != null && !Number.isFinite(input.alertThreshold)) {
    return { ok: false, error: "Le seuil d'alerte doit être un nombre" };
  }
  if ((packName && input.packSize == null) || (!packName && input.packSize != null)) {
    return { ok: false, error: 'Conditionnement : renseigner le nom ET la taille' };
  }
  if (input.packSize != null && input.packSize <= 0) {
    return { ok: false, error: 'La taille du conditionnement doit être positive' };
  }
  const values = {
    name,
    category: input.category?.trim() ?? '',
    baseUnit,
    packName,
    packSize: input.packSize != null ? String(input.packSize) : null,
    purchasePrice: Math.round(input.purchasePrice),
    alertThreshold: input.alertThreshold != null ? String(input.alertThreshold) : null,
    active: input.active ?? true,
  };
  if (input.id) {
    await db.update(products).set(values).where(eq(products.id, input.id));
    return { ok: true, id: input.id };
  }
  const [row] = await db.insert(products).values(values).returning();
  return { ok: true, id: row.id };
}

// Homonymes actif/archivé : saveProduct n'impose pas l'unicité du nom, un
// produit archivé et son remplaçant actif peuvent donc coexister. Tri croissant
// (archivés d'abord, puis par id) : dans une Map construite sur ce tableau, la
// dernière entrée par clé gagne — l'actif fait foi, à état égal le plus récent.
export function preferActive<T extends { id: number; active: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(a.active) - Number(b.active) || a.id - b.id);
}

// Tables référençant un produit, avec leur libellé de motif (spec suppression §3.1).
const PRODUCT_REFS = [
  { table: recipeLines, label: 'fiche(s) technique(s)' },
  { table: orderLines, label: 'ligne(s) de commande' },
  { table: stockMovements, label: 'mouvement(s) de stock' },
  { table: serviceExitLines, label: 'sortie(s) de service' },
  { table: inventoryLines, label: "ligne(s) d'inventaire" },
] as const;

// Suppression définitive : uniquement si AUCUNE référence nulle part.
// Sinon, motif détaillé et invitation à archiver (spec §3.1).
export async function deleteProduct(db: AnyDb, id: number):
  Promise<{ ok: boolean; referenced?: boolean; error?: string }> {
  const [target] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  if (!target) return { ok: false, error: 'Produit introuvable' };
  const details: string[] = [];
  for (const ref of PRODUCT_REFS) {
    const [row] = await db.select({ n: sql<number>`count(*)::int` })
      .from(ref.table).where(eq(ref.table.productId, id));
    if (row.n > 0) details.push(`${row.n} ${ref.label}`);
  }
  if (details.length) {
    return {
      ok: false, referenced: true,
      error: `Produit utilisé (${details.join(', ')}) — archivez-le plutôt`,
    };
  }
  await db.delete(products).where(eq(products.id, id));
  return { ok: true };
}

// Archiver = désactiver (état unifié, spec §3.3). Idempotent.
export async function archiveProduct(db: AnyDb, id: number, archived: boolean):
  Promise<{ ok: boolean; error?: string }> {
  const [target] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  if (!target) return { ok: false, error: 'Produit introuvable' };
  await db.update(products).set({ active: !archived }).where(eq(products.id, id));
  return { ok: true };
}

// Ids de produits référencés quelque part — la liste admin s'en sert pour ne
// proposer « Supprimer » que sur les supprimables (le serveur revérifie via deleteProduct).
export async function getReferencedProductIds(db: AnyDb): Promise<Set<number>> {
  const ids = new Set<number>();
  for (const ref of PRODUCT_REFS) {
    const rows: Array<{ productId: number }> = await db
      .selectDistinct({ productId: ref.table.productId }).from(ref.table);
    for (const r of rows) ids.add(r.productId);
  }
  return ids;
}
