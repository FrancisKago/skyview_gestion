import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { products } from '@/db/schema';

describe('schéma', () => {
  it('migre sur PGlite et accepte le seed de base', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    expect(bar.type).toBe('bar');
    const [p] = await db.insert(products).values({
      name: 'Castel 65cl', baseUnit: 'bouteille',
      packName: 'casier', packSize: '12', purchasePrice: 650,
    }).returning();
    expect(p.id).toBeGreaterThan(0);
    expect(Number(p.packSize)).toBe(12);
  });
});
