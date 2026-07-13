import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import type { Role } from './auth';
import type { AnyDb } from '@/db';

// Le jeton JWT n'est qu'un identifiant authentifié : le rôle qui FAIT FOI est celui
// de la base (spec durcissement §5). Retourne le rôle frais si le compte est actif
// et autorisé pour `roles` (passe-droit admin conservé), null sinon.
// Module pur (sans next/*) pour être testable sur la base PGlite.
export async function freshRoleIfAllowed(
  db: AnyDb, userId: number, roles: Role[],
): Promise<Role | null> {
  const [u] = await db.select({ role: users.role, active: users.active })
    .from(users).where(eq(users.id, userId));
  if (!u || !u.active) return null;
  if (!roles.includes(u.role) && u.role !== 'admin') return null;
  return u.role;
}
