import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder } from '@/lib/orders';
import { recordServiceExit } from '@/lib/service-exits';
import { recordAdjustment } from '@/lib/adjustments';

async function seedInactive(db: Awaited<ReturnType<typeof createTestDb>>) {
  const base = await seedBase(db);
  const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
  await saveProduct(db, {
    id: castel.id, name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650, active: false,
  });
  return { ...base, castelId: castel.id! };
}

describe('garde active côté serveur', () => {
  it('createOrder refuse un produit désactivé (message avec le nom)', async () => {
    const db = await createTestDb();
    const { bar, barman, castelId } = await seedInactive(db);
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: castelId, qtyRequested: 2 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Castel');
    expect(res.error).toContain('désactivé');
  });
  it('recordServiceExit refuse un produit désactivé', async () => {
    const db = await createTestDb();
    const { bar, barman, castelId } = await seedInactive(db);
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-13', createdBy: barman.id,
      lines: [{ productId: castelId, qty: 1 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('désactivé');
  });
  it('recordAdjustment refuse un produit désactivé', async () => {
    const db = await createTestDb();
    const { bar, admin, castelId } = await seedInactive(db);
    const res = await recordAdjustment(db, {
      productId: castelId, locationId: bar.id, qty: -1, reason: 'casse', userId: admin.id,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('désactivé');
  });
  it('un produit actif passe toujours (non-régression)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: riz.id!, qtyRequested: 3 }],
    });
    expect(res.ok).toBe(true);
  });
});
