import { eq, inArray, sql, isNotNull } from 'drizzle-orm';
import { saleArticles, recipeLines, products, salesImportLines } from '@/db/schema';
import type { AnyDb } from '@/db';

export interface SaleArticleInput {
  id?: number;
  cashName: string;
  locationId: number;
  lines: Array<{ productId: number; qty: number }>;
}

export async function saveSaleArticle(db: AnyDb, input: SaleArticleInput):
  Promise<{ ok: boolean; id?: number; error?: string }> {
  const cashName = input.cashName?.trim() ?? '';
  if (!cashName) return { ok: false, error: 'Le nom caisse est obligatoire' };
  if (!input.lines.length) return { ok: false, error: 'La fiche technique doit avoir au moins une ligne' };
  if (input.lines.some((l) => !Number.isFinite(l.qty) || !(l.qty > 0))) {
    return { ok: false, error: 'Toutes les quantités de la fiche doivent être positives' };
  }
  // Check-then-insert (cf. src/lib/users.ts) : le nom caisse est unique en base,
  // on vérifie ici pour retourner un message clair plutôt que de laisser fuiter
  // l'erreur de contrainte SQL brute.
  const [existing] = await db.select().from(saleArticles).where(eq(saleArticles.cashName, cashName));
  if (existing && existing.id !== input.id) {
    return { ok: false, error: 'Ce nom caisse existe déjà' };
  }
  // Vérification d'existence des produits AVANT toute écriture (cf. le check
  // nom caisse ci-dessus) : sans elle, la contrainte FK de recipe_lines ne
  // claquerait qu'APRÈS l'insert/update de l'article et le delete des lignes,
  // laissant un article orphelin ou une fiche vidée.
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const found = await db.select({ id: products.id }).from(products)
    .where(inArray(products.id, productIds));
  if (found.length !== productIds.length) {
    return { ok: false, error: 'Produit inconnu dans la fiche' };
  }
  let id = input.id;
  if (id) {
    await db.update(saleArticles)
      .set({ cashName, locationId: input.locationId })
      .where(eq(saleArticles.id, id));
    // Remplacement delete-puis-insert non transactionnel : le driver neon-http
    // ne supporte pas les transactions (compromis assumé v1). Une panne entre
    // le delete et l'insert laisserait la fiche vide — les validations
    // ci-dessus réduisent la fenêtre aux seules erreurs d'infrastructure.
    await db.delete(recipeLines).where(eq(recipeLines.saleArticleId, id));
  } else {
    const [row] = await db.insert(saleArticles)
      .values({ cashName, locationId: input.locationId })
      .returning();
    id = row.id;
  }
  await db.insert(recipeLines).values(
    input.lines.map((l) => ({ saleArticleId: id!, productId: l.productId, qty: String(l.qty) })),
  );
  return { ok: true, id };
}

// saleArticleId -> [{productId, qty}] — consommé par le rapprochement (Tâche 20).
export async function getRecipeMap(db: AnyDb): Promise<Map<number, Array<{ productId: number; qty: number }>>> {
  const rows = await db.select().from(recipeLines);
  const map = new Map<number, Array<{ productId: number; qty: number }>>();
  for (const r of rows) {
    const list = map.get(r.saleArticleId) ?? [];
    list.push({ productId: r.productId, qty: Number(r.qty) });
    map.set(r.saleArticleId, list);
  }
  return map;
}

// Suppression définitive d'un article : uniquement si aucune vente importée ne le
// référence. SA fiche (recipe_lines) est sa composition : elle part en cascade,
// elle ne bloque pas (spec suppression §3.2).
export async function deleteSaleArticle(db: AnyDb, id: number):
  Promise<{ ok: boolean; referenced?: boolean; error?: string }> {
  const [target] = await db.select({ id: saleArticles.id }).from(saleArticles)
    .where(eq(saleArticles.id, id));
  if (!target) return { ok: false, error: 'Article introuvable' };
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(salesImportLines).where(eq(salesImportLines.saleArticleId, id));
  if (row.n > 0) {
    return {
      ok: false, referenced: true,
      error: `Article utilisé (${row.n} vente(s) importée(s)) — archivez-le plutôt`,
    };
  }
  await db.delete(saleArticles).where(eq(saleArticles.id, id)); // recipe_lines: cascade
  return { ok: true };
}

// Archiver = désactiver (état unifié, spec §3.3). Idempotent.
export async function archiveSaleArticle(db: AnyDb, id: number, archived: boolean):
  Promise<{ ok: boolean; error?: string }> {
  const [target] = await db.select({ id: saleArticles.id }).from(saleArticles)
    .where(eq(saleArticles.id, id));
  if (!target) return { ok: false, error: 'Article introuvable' };
  await db.update(saleArticles).set({ active: !archived }).where(eq(saleArticles.id, id));
  return { ok: true };
}

// Ids d'articles référencés par au moins une vente importée (liste admin).
export async function getReferencedArticleIds(db: AnyDb): Promise<Set<number>> {
  const rows: Array<{ saleArticleId: number | null }> = await db
    .selectDistinct({ saleArticleId: salesImportLines.saleArticleId })
    .from(salesImportLines).where(isNotNull(salesImportLines.saleArticleId));
  return new Set(rows.map((r) => r.saleArticleId!));
}
