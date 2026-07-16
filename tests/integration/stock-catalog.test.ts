import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, archiveProduct } from '@/lib/products';
import { getLocationCatalog } from '@/lib/stock';
import { stockMovements } from '@/db/schema';

// Catalogue de l'emplacement (page Mon stock) : tous les produits actifs même
// sans aucun mouvement (qty 0), plus les archivés qui ont bougé à l'emplacement
// (physiquement encore là). Ne remplace PAS getLocationStock (inventaire,
// compta), dont la sémantique « jamais bougé = absent » est inchangée.
describe('getLocationCatalog', () => {
  it('liste les produits actifs sans mouvement avec qty 0, triés par nom', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await saveProduct(db, { name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: riz.id!, locationId: bar.id, type: 'reception', qty: '4', userId: admin.id,
    });
    const catalog = await getLocationCatalog(db, bar.id);
    expect(catalog.map((l) => l.name)).toEqual(['Castel 65cl', 'Riz']);
    expect(catalog[0]).toMatchObject({ qty: 0, value: 0, active: true });   // jamais bougé
    expect(catalog[1]).toMatchObject({ qty: 4, value: 2000, active: true });
  });
  it('ne compte que les mouvements de l’emplacement demandé', async () => {
    const db = await createTestDb();
    const { bar, cuisine, admin } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await db.insert(stockMovements).values({
      productId: riz.id!, locationId: cuisine.id, type: 'reception', qty: '9', userId: admin.id,
    });
    const [line] = await getLocationCatalog(db, bar.id);
    expect(line).toMatchObject({ name: 'Riz', qty: 0 }); // le stock cuisine n'apparaît pas au bar
  });
  it('archivé sans mouvement : absent ; archivé avec mouvement : présent et marqué', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const fantome = await saveProduct(db, { name: 'Fantôme', baseUnit: 'kg', purchasePrice: 100 });
    const restant = await saveProduct(db, { name: 'Restant', baseUnit: 'kg', purchasePrice: 200 });
    await db.insert(stockMovements).values({
      productId: restant.id!, locationId: bar.id, type: 'reception', qty: '2', userId: admin.id,
    });
    await archiveProduct(db, fantome.id!, true);
    await archiveProduct(db, restant.id!, true);
    const catalog = await getLocationCatalog(db, bar.id);
    expect(catalog.map((l) => l.name)).toEqual(['Restant']);
    expect(catalog[0]).toMatchObject({ qty: 2, active: false });
  });
  it('seuil : alerte au seuil ou en dessous, y compris à zéro (même règle que getLocationStock)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    await saveProduct(db, { name: 'Whisky', baseUnit: 'bouteille', purchasePrice: 9000, alertThreshold: 2 });
    const [line] = await getLocationCatalog(db, bar.id);
    expect(line.belowThreshold).toBe(true); // 0 <= 2
  });
});
