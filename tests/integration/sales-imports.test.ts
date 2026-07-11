import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { saveSaleArticle } from '@/lib/sale-articles';
import { recordServiceExit } from '@/lib/service-exits';
import { storeSalesImport, matchImportLine, getReconciliationReport } from '@/lib/sales-imports';
import { stockMovements, salesImportLines, saleArticles } from '@/db/schema';

async function setup(db: Awaited<ReturnType<typeof createTestDb>>) {
  const base = await seedBase(db);
  const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
  const article = await saveSaleArticle(db, {
    cashName: 'Castel 65cl', locationId: base.bar.id,
    lines: [{ productId: castel.id!, qty: 1 }],
  });
  // Stock initial + sorties déclarées : 20 castel sorties le 2026-07-10
  await db.insert(stockMovements).values({
    productId: castel.id!, locationId: base.bar.id, type: 'reception', qty: '48', userId: base.barman.id,
  });
  await recordServiceExit(db, {
    locationId: base.bar.id, serviceDate: '2026-07-10', createdBy: base.barman.id,
    lines: [{ productId: castel.id!, qty: 20 }],
  });
  return { ...base, castel, article };
}

describe('storeSalesImport', () => {
  it('associe automatiquement les articles connus et met en attente les inconnus', async () => {
    const db = await createTestDb();
    const { comptable } = await setup(db);
    const res = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [
        { articleName: 'Castel 65cl', qty: 24 },   // connu
        { articleName: 'Mojito spécial', qty: 3 }, // inconnu
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.matched).toBe(1);
    expect(res.unmatched).toBe(1);
  });

  it('refuse une date de service invalide', async () => {
    const db = await createTestDb();
    const { comptable } = await setup(db);
    const res = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: 'not-a-date', uploadedBy: comptable.id,
      rows: [{ articleName: 'Castel 65cl', qty: 24 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Date de service invalide');
  });

  it('refuse des quantités de vente invalides', async () => {
    const db = await createTestDb();
    const { comptable } = await setup(db);
    const res = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [{ articleName: 'Castel 65cl', qty: 0 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Quantités de vente invalides');
  });

  it('refuse un import sans lignes', async () => {
    const db = await createTestDb();
    const { comptable } = await setup(db);
    const res = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [],
    });
    expect(res.ok).toBe(false);
  });
});

describe('matchImportLine + rapport', () => {
  it('la correspondance manuelle est mémorisée et le rapport compare théorique vs déclaré', async () => {
    const db = await createTestDb();
    const { comptable, bar, castel } = await setup(db);
    const imp = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [{ articleName: 'CASTEL GRANDE', qty: 24 }], // orthographe caisse inconnue
    });
    // Le comptable associe la ligne inconnue à l'article existant -> mémorisé comme alias
    const pending = await db.select().from(salesImportLines);
    await matchImportLine(db, { lineId: pending[0].id, saleArticleCashName: 'Castel 65cl' });

    const report = await getReconciliationReport(db, { importId: imp.id!, locationId: bar.id });
    // Théorique 24 (ventes) vs déclaré 20 (sorties) -> gap -4, -2600 FCFA
    const line = report.lines.find((l) => l.productId === castel.id)!;
    expect(line).toMatchObject({ theoretical: 24, declared: 20, gap: -4, gapValue: -2600 });
    expect(report.totalGapValue).toBe(-2600);
  });

  it('un import ultérieur avec la même orthographe brute matche automatiquement via l\'alias', async () => {
    const db = await createTestDb();
    const { comptable, bar, castel } = await setup(db);
    const imp1 = await storeSalesImport(db, {
      filename: 'ventes1.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [{ articleName: 'CASTEL GRANDE', qty: 24 }],
    });
    const pending = await db.select().from(salesImportLines)
      .where(eq(salesImportLines.importId, imp1.id!));
    await matchImportLine(db, { lineId: pending[0].id, saleArticleCashName: 'Castel 65cl' });

    const imp2 = await storeSalesImport(db, {
      filename: 'ventes2.csv', serviceDate: '2026-07-11', uploadedBy: comptable.id,
      rows: [{ articleName: 'CASTEL GRANDE', qty: 10 }],
    });
    expect(imp2.matched).toBe(1);
    expect(imp2.unmatched).toBe(0);

    const report = await getReconciliationReport(db, { importId: imp2.id!, locationId: bar.id });
    expect(report.unmatchedCount).toBe(0);
    const line = report.lines.find((l) => l.productId === castel.id);
    expect(line?.theoretical).toBe(10);
  });

  it('une correspondance matche EN MASSE toutes les lignes en attente du même nom brut', async () => {
    const db = await createTestDb();
    const { comptable } = await setup(db);
    // Deux imports contenant la même orthographe caisse inconnue
    const imp1 = await storeSalesImport(db, {
      filename: 'ventes1.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [{ articleName: 'MOJITO SPÉCIAL', qty: 3 }],
    });
    await storeSalesImport(db, {
      filename: 'ventes2.csv', serviceDate: '2026-07-11', uploadedBy: comptable.id,
      rows: [{ articleName: 'MOJITO SPÉCIAL', qty: 5 }],
    });
    const [line1] = await db.select().from(salesImportLines)
      .where(eq(salesImportLines.importId, imp1.id!));
    const res = await matchImportLine(db, { lineId: line1.id, saleArticleCashName: 'Castel 65cl' });
    expect(res.ok).toBe(true);
    expect(res.updatedCount).toBe(2);
    const all = await db.select().from(salesImportLines);
    expect(all.every((l) => l.saleArticleId != null)).toBe(true);
  });

  it('ne crée pas deux alias pour la même orthographe à la casse près', async () => {
    const db = await createTestDb();
    const { comptable } = await setup(db);
    const imp = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [
        { articleName: 'CASTEL GRANDE', qty: 2 },
        { articleName: 'castel grande', qty: 1 },
      ],
    });
    const lines = await db.select().from(salesImportLines)
      .where(eq(salesImportLines.importId, imp.id!));
    // Deux appels explicites (le premier matche déjà les deux lignes en masse) :
    // le second ne doit PAS créer un alias supplémentaire malgré la casse différente.
    await matchImportLine(db, { lineId: lines[0].id, saleArticleCashName: 'Castel 65cl' });
    await matchImportLine(db, { lineId: lines[1].id, saleArticleCashName: 'Castel 65cl' });
    const articles = await db.select().from(saleArticles);
    const grandes = articles.filter((a) => a.cashName.toLowerCase() === 'castel grande');
    expect(grandes).toHaveLength(1);
  });

  it("retourne un rapport vide pour un import inexistant", async () => {
    const db = await createTestDb();
    const { bar } = await setup(db);
    const report = await getReconciliationReport(db, { importId: 999999, locationId: bar.id });
    expect(report).toEqual({ lines: [], totalGapValue: 0, unmatchedCount: 0 });
  });
});
