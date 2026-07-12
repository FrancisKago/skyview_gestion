import { and, eq } from 'drizzle-orm';
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

export async function setUserActive(db: AnyDb, userId: number, active: boolean):
  Promise<{ ok: boolean; error?: string }> {
  if (!active) {
    // Garde-fou : ne jamais désactiver le dernier admin actif (lockout total).
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (target?.role === 'admin' && target.active) {
      const admins = await db.select().from(users)
        .where(and(eq(users.role, 'admin'), eq(users.active, true)));
      if (admins.length <= 1) {
        return { ok: false, error: 'Impossible de désactiver le dernier admin actif' };
      }
    }
  }
  await db.update(users).set({ active }).where(eq(users.id, userId));
  return { ok: true };
}

// Édition admin d'un compte : nom, rôle, mot de passe optionnel (vide = conservé).
// Garde symétrique de setUserActive : on ne retire pas le rôle admin au dernier admin actif.
export async function updateUser(db: AnyDb, input: {
  id: number; name: string; role: Role; password?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.name.trim()) return { ok: false, error: 'Le nom est obligatoire' };
  if (!VALID_ROLES.includes(input.role)) return { ok: false, error: 'Rôle invalide' };
  if (input.password && input.password.length < 8) {
    return { ok: false, error: 'Mot de passe : 8 caractères minimum' };
  }
  const [target] = await db.select().from(users).where(eq(users.id, input.id));
  if (!target) return { ok: false, error: 'Utilisateur introuvable' };
  if (target.role === 'admin' && target.active && input.role !== 'admin') {
    const admins = await db.select().from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true)));
    if (admins.length <= 1) {
      return { ok: false, error: "Impossible de retirer le rôle admin au dernier admin actif" };
    }
  }
  const values: { name: string; role: Role; passwordHash?: string } = {
    name: input.name.trim(), role: input.role,
  };
  if (input.password) values.passwordHash = await hashPassword(input.password);
  await db.update(users).set(values).where(eq(users.id, input.id));
  return { ok: true };
}
