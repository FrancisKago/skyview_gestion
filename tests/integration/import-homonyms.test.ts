import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, archiveProduct, preferActive } from '@/lib/products';
import { importProducts } from '@/lib/import-products';
import { importArticles } from '@/lib/import-articles';
import { importInventory } from '@/lib/import-inventory';
import { products, recipeLines, saleArticles, stockMovements } from '@/db/schema';

// Homonymes actif/archivé : saveProduct n'impose pas l'unicité du nom, donc un
// produit archivé et son remplaçant actif peuvent coexister. Les imports doivent
// résoudre le nom de façon déterministe : l'actif fait foi.
describe('résolution des homonymes produit dans les imports', () => {
  // Crée un homonyme où l'ARCHIVÉ a l'id le plus récent : si l'actif gagne
  // quand même, la préférence est bien par état et pas par ordre d'insertion.
  async function seedHomonyms(db: Awaited<ReturnType<typeof createTestDb>>) {
    const actif = await saveProduct(db, { name: 'Coca 33cl', baseUnit: 'bouteille', purchasePrice: 300 });
    const archive = await saveProduct(db, { name: 'Coca 33cl', baseUnit: 'bouteille', purchasePrice: 250 });
    await archiveProduct(db, archive.id!, true);
    return { actifId: actif.id!, archiveId: archive.id! };
  }

  it('preferActive : l’actif gagne, à état égal l’id le plus récent', () => {
    const sorted = preferActive([
      { id: 3, active: false },
      { id: 2, active: true },
      { id: 1, active: true },
    ]);
    // Tri croissant (archivés d'abord, puis actifs par id) : le dernier par clé
    // d'une Map construite dessus est l'actif le plus récent.
    expect(sorted.map((p) => p.id)).toEqual([3, 1, 2]);
  });

  it('importInventory compte l’homonyme actif, pas l’archivé', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const { actifId, archiveId } = await seedHomonyms(db);
    const res = await importInventory(db, [
      { line: 2, cells: { 'Produit': 'Coca 33cl', 'Quantité comptée': '10' } },
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.gaps[0].productId).toBe(actifId);
    const movements = await db.select().from(stockMovements)
      .where(and(eq(stockMovements.type, 'ajustement_inventaire'), eq(stockMovements.productId, archiveId)));
    expect(movements).toHaveLength(0);
  });

  it('importProducts (update) met à jour l’homonyme actif, pas l’archivé', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { actifId, archiveId } = await seedHomonyms(db);
    const report = await importProducts(db, [
      { line: 2, cells: {
        'Nom': 'Coca 33cl', 'Catégorie': '', 'Unité de base': 'bouteille', 'Conditionnement': '',
        'Taille conditionnement': '', "Prix d'achat (FCFA)": '350', "Seuil d'alerte": '',
      } },
    ], { update: true });
    expect(report.updated).toBe(1);
    const [actif] = await db.select().from(products).where(eq(products.id, actifId));
    const [archive] = await db.select().from(products).where(eq(products.id, archiveId));
    expect(actif.purchasePrice).toBe(350);
    expect(archive.purchasePrice).toBe(250); // intact
    expect(archive.active).toBe(false);      // toujours archivé
  });

  it('importArticles rattache la fiche à l’homonyme actif', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { actifId } = await seedHomonyms(db);
    const report = await importArticles(db, [
      { line: 2, cells: { 'Article caisse': 'Coca', 'Emplacement': 'Bar', 'Produit': 'Coca 33cl', 'Quantité': '1' } },
    ], { update: false });
    expect(report.created).toBe(1);
    const [art] = await db.select().from(saleArticles).where(eq(saleArticles.cashName, 'Coca'));
    const lines = await db.select().from(recipeLines).where(eq(recipeLines.saleArticleId, art.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe(actifId);
  });
});
