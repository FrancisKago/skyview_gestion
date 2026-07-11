import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { createUser, setUserActive } from '@/lib/users';
import { verifyPassword } from '@/lib/auth';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('createUser', () => {
  it('crée un utilisateur avec mot de passe haché', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const res = await createUser(db, {
      name: 'Paul', username: 'paul', password: 'motdepasse1', role: 'barman',
    });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.username, 'paul'));
    expect(await verifyPassword('motdepasse1', row.passwordHash)).toBe(true);
  });
  it('refuse un identifiant déjà pris et un mot de passe trop court', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await createUser(db, { name: 'X', username: 'admin', password: 'motdepasse1', role: 'barman' })).ok).toBe(false);
    expect((await createUser(db, { name: 'X', username: 'nouveau', password: 'abc', role: 'barman' })).ok).toBe(false);
  });
  it('refuse un rôle invalide', async () => {
    const db = await createTestDb();
    await seedBase(db);
    // @ts-expect-error rôle volontairement invalide (simule un POST forgé)
    expect((await createUser(db, { name: 'X', username: 'hacker', password: 'motdepasse1', role: 'superadmin' })).ok).toBe(false);
  });
});

describe('setUserActive', () => {
  it('désactive puis réactive un utilisateur non-admin', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    expect((await setUserActive(db, barman.id, false)).ok).toBe(true);
    let [row] = await db.select().from(users).where(eq(users.id, barman.id));
    expect(row.active).toBe(false);
    expect((await setUserActive(db, barman.id, true)).ok).toBe(true);
    [row] = await db.select().from(users).where(eq(users.id, barman.id));
    expect(row.active).toBe(true);
  });
  it('refuse de désactiver le dernier admin actif', async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db); // seul admin du seed
    const res = await setUserActive(db, admin.id, false);
    expect(res.ok).toBe(false);
    const [row] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(row.active).toBe(true);
  });
});
