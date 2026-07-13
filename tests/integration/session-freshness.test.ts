import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { freshRoleIfAllowed } from '@/lib/session-freshness';
import { users } from '@/db/schema';

describe('freshRoleIfAllowed', () => {
  it('compte actif au bon rôle -> rôle frais', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    expect(await freshRoleIfAllowed(db, barman.id, ['barman'])).toBe('barman');
  });
  it('compte désactivé -> null, même avec un jeton encore valide', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    await db.update(users).set({ active: false }).where(eq(users.id, barman.id));
    expect(await freshRoleIfAllowed(db, barman.id, ['barman'])).toBeNull();
  });
  it('rôle rétrogradé en base -> null pour l\'accès admin (le jeton ne fait plus foi)', async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db);
    await db.update(users).set({ role: 'comptable' }).where(eq(users.id, admin.id));
    expect(await freshRoleIfAllowed(db, admin.id, ['admin'])).toBeNull();
    // …mais l'accès comptable, lui, est désormais permis :
    expect(await freshRoleIfAllowed(db, admin.id, ['comptable'])).toBe('comptable');
  });
  it('passe-droit admin conservé ; utilisateur inconnu -> null', async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db);
    expect(await freshRoleIfAllowed(db, admin.id, ['comptable'])).toBe('admin');
    expect(await freshRoleIfAllowed(db, 999999, ['admin'])).toBeNull();
  });
});
