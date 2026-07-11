import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { hashPassword, type Role } from './auth';
import type { AnyDb } from '@/db';

const VALID_ROLES: Role[] = ['admin', 'magasinier', 'barman', 'cuisinier', 'comptable'];

export async function createUser(db: AnyDb, input: {
  name: string; username: string; password: string; role: Role;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.name.trim() || !input.username.trim()) {
    return { ok: false, error: 'Nom et identifiant obligatoires' };
  }
  if (!VALID_ROLES.includes(input.role)) {
    return { ok: false, error: 'Rôle invalide' };
  }
  if (input.password.length < 8) {
    return { ok: false, error: 'Mot de passe : 8 caractères minimum' };
  }
  const [existing] = await db.select().from(users)
    .where(eq(users.username, input.username.trim().toLowerCase()));
  if (existing) return { ok: false, error: 'Cet identifiant est déjà utilisé' };
  await db.insert(users).values({
    name: input.name.trim(),
    username: input.username.trim().toLowerCase(),
    passwordHash: await hashPassword(input.password),
    role: input.role,
  });
  return { ok: true };
}

export async function setUserActive(db: AnyDb, userId: number, active: boolean) {
  await db.update(users).set({ active }).where(eq(users.id, userId));
}
