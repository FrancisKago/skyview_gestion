import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { createUser, updateUser } from '@/lib/users';
import { verifyPassword } from '@/lib/auth';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('updateUser', () => {
  it('met à jour nom et rôle sans toucher au mot de passe si absent', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    const [before] = await db.select().from(users).where(eq(users.id, barman.id));
    const res = await updateUser(db, { id: barman.id, name: 'Paul Grand', role: 'cuisinier' });
    expect(res.ok).toBe(true);
    const [after] = await db.select().from(users).where(eq(users.id, barman.id));
    expect(after.name).toBe('Paul Grand');
    expect(after.role).toBe('cuisinier');
    expect(after.passwordHash).toBe(before.passwordHash); // inchangé
  });
  it('remplace le mot de passe quand fourni (≥ 8 caractères)', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    expect((await updateUser(db, { id: barman.id, name: 'Bar', role: 'barman', password: 'court' })).ok).toBe(false);
    const res = await updateUser(db, { id: barman.id, name: 'Bar', role: 'barman', password: 'nouveaumdp1' });
    expect(res.ok).toBe(true);
    const [after] = await db.select().from(users).where(eq(users.id, barman.id));
    expect(await verifyPassword('nouveaumdp1', after.passwordHash)).toBe(true);
  });
  it('refuse de retirer le rôle admin au dernier admin actif', async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db); // seul admin du seed
    const res = await updateUser(db, { id: admin.id, name: 'Admin', role: 'comptable' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('dernier admin');
    const [after] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(after.role).toBe('admin'); // rien écrit
  });
  it("accepte le changement de rôle d'un admin s'il en reste un autre actif", async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db);
    await createUser(db, { name: 'Admin2', username: 'admin2', password: 'motdepasse2', role: 'admin' });
    const res = await updateUser(db, { id: admin.id, name: 'Ex-Admin', role: 'comptable' });
    expect(res.ok).toBe(true);
  });
  it('refuse un utilisateur inconnu, un nom vide, un rôle invalide', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    expect((await updateUser(db, { id: 999999, name: 'X', role: 'barman' })).ok).toBe(false);
    expect((await updateUser(db, { id: barman.id, name: '  ', role: 'barman' })).ok).toBe(false);
    expect((await updateUser(db, { id: barman.id, name: 'X', role: 'patron' as never })).ok).toBe(false);
  });
});
