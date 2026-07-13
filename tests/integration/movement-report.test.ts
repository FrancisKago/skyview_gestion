import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { getMovementReport } from '@/lib/movement-report';
import { stockMovements } from '@/db/schema';

type Mv = {
  productId: number; locationId: number;
  type: 'reception' | 'sortie_service' | 'ajustement_inventaire' | 'ajustement_admin';
  qty: number; userId: number; createdAt: string;
};
// createdAt explicite (ISO local) : les tests contrôlent la datation du journal.
async function insertMovements(db: Awaited<ReturnType<typeof createTestDb>>, mvs: Mv[]) {
  await db.insert(stockMovements).values(mvs.map((m) => ({
    productId: m.productId, locationId: m.locationId, type: m.type,
    qty: String(m.qty), userId: m.userId, createdAt: new Date(m.createdAt),
  })));
}

describe('getMovementReport', () => {
  it('stock initial = somme avant la période ; aucune colonne de période ; final = initial', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 24, userId: barman.id, createdAt: '2026-02-10T10:00:00' },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: -4, userId: barman.id, createdAt: '2026-02-20T22:00:00' },
    ]);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: 'Castel 65cl', baseUnit: 'bouteille',
      initial: 20, receptions: 0, sorties: 0, ajustements: 0, final: 20,
    });
  });
  it('ventile la période par type : réceptions +, sorties en absolu, ajustements signés', async () => {
    const db = await createTestDb();
    const { cuisine, cuisinier, admin } = await seedBase(db);
    const poulet = await saveProduct(db, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 });
    await insertMovements(db, [
      { productId: poulet.id!, locationId: cuisine.id, type: 'reception', qty: 5, userId: cuisinier.id, createdAt: '2026-02-15T09:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'reception', qty: 10, userId: cuisinier.id, createdAt: '2026-03-05T09:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'sortie_service', qty: -4, userId: cuisinier.id, createdAt: '2026-03-10T21:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'ajustement_inventaire', qty: -1, userId: cuisinier.id, createdAt: '2026-03-15T18:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'ajustement_admin', qty: 2, userId: admin.id, createdAt: '2026-03-20T11:00:00' },
    ]);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: cuisine.id });
    expect(l.initial).toBe(5);
    expect(l.receptions).toBe(10);
    expect(l.sorties).toBe(4);        // valeur absolue
    expect(l.ajustements).toBe(1);    // -1 + 2, signé
    expect(l.final).toBe(12);         // 5 + 10 - 4 + 1
  });
  it('bornes : le jour « du » et le jour « au » sont inclus, la veille compte dans l’initial, le lendemain est exclu', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await insertMovements(db, [
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 1, userId: barman.id, createdAt: '2026-02-28T23:59:00' }, // veille -> initial
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 2, userId: barman.id, createdAt: '2026-03-01T00:01:00' }, // jour du -> période
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 4, userId: barman.id, createdAt: '2026-03-31T23:58:00' }, // jour au -> période
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 8, userId: barman.id, createdAt: '2026-04-01T00:01:00' }, // lendemain -> exclu
    ]);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(l.initial).toBe(1);
    expect(l.receptions).toBe(6);
    expect(l.final).toBe(7); // le mouvement d'avril n'apparaît nulle part
  });
  it('productIds restreint aux produits listés ; liste vide -> résultat vide', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const guinness = await saveProduct(db, { name: 'Guinness', baseUnit: 'bouteille', purchasePrice: 800 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 10, userId: barman.id, createdAt: '2026-03-02T10:00:00' },
      { productId: guinness.id!, locationId: bar.id, type: 'reception', qty: 6, userId: barman.id, createdAt: '2026-03-02T10:00:00' },
    ]);
    const lines = await getMovementReport(db, {
      from: '2026-03-01', to: '2026-03-31', locationId: bar.id, productIds: [castel.id!],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Castel');
    expect(await getMovementReport(db, {
      from: '2026-03-01', to: '2026-03-31', locationId: bar.id, productIds: [],
    })).toEqual([]);
  });
  it('jamais bougé -> absent ; consommé à zéro -> présent avec 0 partout au final', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    await saveProduct(db, { name: 'Jamais bougé', baseUnit: 'kg', purchasePrice: 100 });
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 6, userId: barman.id, createdAt: '2026-02-10T10:00:00' },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: -6, userId: barman.id, createdAt: '2026-02-11T22:00:00' },
    ]);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(lines).toHaveLength(1); // « Jamais bougé » absent
    expect(lines[0]).toMatchObject({ name: 'Castel', initial: 0, final: 0 });
  });
  it('valorise initial et final au prix d’achat (arrondi entier)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 10, userId: barman.id, createdAt: '2026-02-10T10:00:00' },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: -2.5, userId: barman.id, createdAt: '2026-03-10T22:00:00' },
    ]);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(l.initialValue).toBe(6500);       // 10 × 650
    expect(l.finalValue).toBe(4875);         // 7,5 × 650
  });
});
