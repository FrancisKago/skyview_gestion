import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, SESSION_COOKIE, type Session, type Role } from './auth';

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

// À appeler en tête de chaque Server Action / page protégée.
export async function requireRole(roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role) && session.role !== 'admin') {
    throw new Error('Accès refusé pour ce rôle');
  }
  return session;
}
