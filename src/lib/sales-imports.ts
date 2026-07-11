import { and, eq, sql } from 'drizzle-orm';
import {
  salesImports, salesImportLines, saleArticles, products, recipeLines,
  serviceExits, serviceExitLines,
} from '@/db/schema';
import { getRecipeMap } from './sale-articles';
import { computeTheoretical, reconcile, type ReconciliationLine } from './reconciliation';
import { isValidDateString } from './dates';
import { round3 } from './units';
import type { AnyDb } from '@/db';

export async function storeSalesImport(db: AnyDb, input: {
  filename: string; serviceDate: string; uploadedBy: number;
  rows: Array<{ articleName: string; qty: number }>;
}): Promise<{ ok: boolean; id?: number; matched?: number; unmatched?: number; error?: string }> {
  if (!input.rows.length) return { ok: false, error: 'Aucune ligne à importer' };
  if (!isValidDateString(input.serviceDate)) {
    return { ok: false, error: 'Date de service invalide' };
  }
  // Rejette les quantités non finies (NaN/Infinity forgées) ET les quantités nulles
  // ou négatives AVANT toute écriture : cf. convention de src/lib/orders.ts#createOrder.
  if (input.rows.some((r) => !Number.isFinite(r.qty) || !(r.qty > 0))) {
    return { ok: false, error: 'Quantités de vente invalides' };
  }
  const articles = await db.select().from(saleArticles);
  const byName = new Map<string, number>(
    articles.map((a: { cashName: string; id: number }) => [a.cashName.toLowerCase(), a.id]),
  );
  const [imp] = await db.insert(salesImports).values({
    filename: input.filename, serviceDate: input.serviceDate, uploadedBy: input.uploadedBy,
  }).returning();
  let matched = 0, unmatched = 0;
  for (const row of input.rows) {
    const saleArticleId = byName.get(row.articleName.trim().toLowerCase()) ?? null;
    if (saleArticleId) matched++; else unmatched++;
    await db.insert(salesImportLines).values({
      importId: imp.id, articleNameRaw: row.articleName.trim(),
      qty: String(row.qty), saleArticleId,
    });
  }
  return { ok: true, id: imp.id, matched, unmatched };
}

// Associe une ligne en attente à un article existant, puis mémorise
// l'orthographe brute comme alias (article + copie de fiche) pour
// que les prochains imports matchent automatiquement.
// Simplification v1 assumée : l'alias duplique la fiche technique sous le nom
// caisse brut plutôt que de gérer une table d'alias séparée — un changement
// ultérieur de la fiche « source » ne se répercute donc pas sur ses alias.
export async function matchImportLine(db: AnyDb, input: {
  lineId: number; saleArticleCashName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const [target] = await db.select().from(saleArticles)
    .where(eq(saleArticles.cashName, input.saleArticleCashName));
  if (!target) return { ok: false, error: 'Article de vente introuvable' };
  const [line] = await db.select().from(salesImportLines)
    .where(eq(salesImportLines.id, input.lineId));
  if (!line) return { ok: false, error: "Ligne d'import introuvable" };
  await db.update(salesImportLines)
    .set({ saleArticleId: target.id })
    .where(eq(salesImportLines.id, input.lineId));
  // Alias : copie de fiche technique sous le nom brut, pour les prochains imports.
  const existingAlias = await db.select().from(saleArticles)
    .where(eq(saleArticles.cashName, line.articleNameRaw));
  if (!existingAlias.length && line.articleNameRaw.toLowerCase() !== target.cashName.toLowerCase()) {
    const [alias] = await db.insert(saleArticles).values({
      cashName: line.articleNameRaw, locationId: target.locationId,
    }).returning();
    const lines = await db.select().from(recipeLines)
      .where(eq(recipeLines.saleArticleId, target.id));
    if (lines.length) {
      await db.insert(recipeLines).values(lines.map((l: { productId: number; qty: string }) => ({
        saleArticleId: alias.id, productId: l.productId, qty: l.qty,
      })));
    }
  }
  return { ok: true };
}

export interface ReconciliationReport {
  lines: ReconciliationLine[];
  totalGapValue: number;
  unmatchedCount: number;
}

const EMPTY_REPORT: ReconciliationReport = { lines: [], totalGapValue: 0, unmatchedCount: 0 };

// Compare : ventes de l'import (converties via fiches) vs sorties déclarées
// du même emplacement à la même date de service.
// Import inexistant : retourne un rapport vide plutôt que de lever une erreur — la page
// /compta/rapprochements peut être visitée avec un importId périmé (lien partagé, etc.)
// et doit rester affichable sans planter.
export async function getReconciliationReport(db: AnyDb, input: {
  importId: number; locationId: number;
}): Promise<ReconciliationReport> {
  const [imp] = await db.select().from(salesImports).where(eq(salesImports.id, input.importId));
  if (!imp) return EMPTY_REPORT;
  const importLines = await db.select().from(salesImportLines)
    .where(eq(salesImportLines.importId, input.importId));
  const unmatchedCount = importLines.filter(
    (l: { saleArticleId: number | null }) => !l.saleArticleId,
  ).length;

  // Ventes matchées, restreintes aux articles de CET emplacement
  const articles = await db.select().from(saleArticles)
    .where(eq(saleArticles.locationId, input.locationId));
  const articleIds = new Set(articles.map((a: { id: number }) => a.id));
  const sales = importLines
    .filter((l: { saleArticleId: number | null }) =>
      l.saleArticleId && articleIds.has(l.saleArticleId))
    .map((l: { saleArticleId: number | null; qty: string }) =>
      ({ saleArticleId: l.saleArticleId!, qty: round3(Number(l.qty)) }));
  const theoretical = computeTheoretical(sales, await getRecipeMap(db));

  // Sorties déclarées du même jour de service
  const exits: Array<{ productId: number; qty: string }> = await db.select({
    productId: serviceExitLines.productId,
    qty: sql<string>`sum(${serviceExitLines.qty})`,
  }).from(serviceExitLines)
    .innerJoin(serviceExits, eq(serviceExitLines.serviceExitId, serviceExits.id))
    .where(and(
      eq(serviceExits.locationId, input.locationId),
      eq(serviceExits.serviceDate, imp.serviceDate),
    ))
    .groupBy(serviceExitLines.productId);
  const declared = new Map<number, number>(exits.map((e) => [e.productId, Number(e.qty)]));

  const prods: Array<{ id: number; name: string; baseUnit: string; purchasePrice: number }> =
    await db.select().from(products);
  const productMap = new Map<number, { name: string; baseUnit: string; purchasePrice: number }>(
    prods.map((p) => [p.id, { name: p.name, baseUnit: p.baseUnit, purchasePrice: p.purchasePrice }]),
  );

  const lines = reconcile(theoretical, declared, productMap);
  return {
    lines,
    totalGapValue: lines.reduce((sum, l) => sum + l.gapValue, 0),
    unmatchedCount,
  };
}
