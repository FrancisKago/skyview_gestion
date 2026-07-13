import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, SESSION_COOKIE, type Session, type Role } from './auth';
import { db } from '@/db';
import { freshRoleIfAllowed } from './session-freshness';

// Ré-exporté ici pour la commodité des imports côté serveur (Server Actions / pages).
// Défini dans './auth' (module pur, sans `next/headers`) pour rester importable
// depuis le proxy sans tirer de dépendances serveur incompatibles avec l'Edge runtime.
export { SESSION_COOKIE };

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// À appeler en tête de chaque Server Action / page protégée. Depuis le durcissement
// post-v1, le rôle est re-vérifié EN BASE à chaque appel : rétrogradation ou
// désactivation de compte prennent effet à la requête suivante (le proxy Edge, lui,
// reste un pré-filtre rapide par jeton). Tout refus -> retour au login.
export async function requireRole(roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  const fresh = await freshRoleIfAllowed(db, session.userId, roles);
  if (!fresh) redirect('/login');
  return { ...session, role: fresh };
}
