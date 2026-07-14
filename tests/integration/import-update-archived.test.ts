import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, archiveProduct } from '@/lib/products';
import { importProducts } from '@/lib/import-products';
import { products } from '@/db/schema';

const row = (line: number, cells: Record<string, string>) => ({
  line,
  cells: {
    'Nom': '', 'Catégorie': '', 'Unité de base': '', 'Conditionnement': '',
    'Taille conditionnement': '', "Prix d'achat (FCFA)": '', "Seuil d'alerte": '',
    ...cells,
  },
});

// Un update qui ne se prononce pas sur `active` ne doit pas réactiver un
// produit archivé : l'archivage relève d'archiveProduct ou d'un `active`
// explicite (case à cocher du formulaire admin), pas d'un import de masse.
describe('update d’un produit archivé', () => {
  it('importProducts (update) met à jour les valeurs SANS réactiver l’archivé', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const vieux = await saveProduct(db, { name: 'Vieux Rhum', baseUnit: 'bouteille', purchasePrice: 5000 });
    await archiveProduct(db, vieux.id!, true);
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Vieux Rhum', 'Unité de base': 'bouteille', "Prix d'achat (FCFA)": '5500' }),
    ], { update: true });
    expect(report.updated).toBe(1);
    const [after] = await db.select().from(products).where(eq(products.id, vieux.id!));
    expect(after.purchasePrice).toBe(5500);
    expect(after.active).toBe(false); // toujours archivé
  });
  it('saveProduct : sans `active`, l’état est préservé ; explicite, il est appliqué', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const p = await saveProduct(db, { name: 'Pastis', baseUnit: 'bouteille', purchasePrice: 4000 });
    await archiveProduct(db, p.id!, true);
    await saveProduct(db, { id: p.id, name: 'Pastis', baseUnit: 'bouteille', purchasePrice: 4200 });
    let [after] = await db.select().from(products).where(eq(products.id, p.id!));
    expect(after.active).toBe(false); // update muet sur active -> préservé
    await saveProduct(db, { id: p.id, name: 'Pastis', baseUnit: 'bouteille', purchasePrice: 4200, active: true });
    [after] = await db.select().from(products).where(eq(products.id, p.id!));
    expect(after.active).toBe(true); // explicite (formulaire admin) -> appliqué
  });
});
