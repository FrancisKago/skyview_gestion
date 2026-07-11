'use server';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { users, locations } from '@/db/schema';
import { verifyPassword, createSessionToken } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/session';

const HOME_BY_ROLE: Record<string, string> = {
  admin: '/admin/produits', magasinier: '/livraisons',
  barman: '/stock', cuisinier: '/stock', comptable: '/compta',
};

export type LoginState = { error?: string };

// Hash bcrypt réel (mot de passe factice) : comparé quand l'utilisateur n'existe pas
// ou est inactif, pour un temps de réponse constant (anti-énumération d'identifiants).
const DUMMY_HASH = '$2b$10$m0LJg//hl2QA3CVQ3EGxJu59SqfxfeVr.OwiAYULOD0GnH08FtJO2';

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  let user: typeof users.$inferSelect | undefined;
  let locationId: number | null = null;
  try {
    [user] = await db.select().from(users).where(eq(users.username, username));
    // Toujours effectuer une comparaison bcrypt (travail constant), même si
    // l'utilisateur est inconnu ou inactif.
    const ok = user && user.active
      ? await verifyPassword(password, user.passwordHash)
      : (await verifyPassword(password, DUMMY_HASH), false);
    if (!ok || !user) {
      return { error: 'Identifiant ou mot de passe incorrect' };
    }
    if (user.role === 'barman' || user.role === 'cuisinier') {
      const type = user.role === 'barman' ? 'bar' : 'cuisine';
      const [loc] = await db.select().from(locations).where(eq(locations.type, type));
      locationId = loc?.id ?? null;
    }
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }

  const token = await createSessionToken({
    userId: user.id, role: user.role, name: user.name, locationId,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 12 * 3600,
  });
  // redirect() fonctionne en levant une exception : il doit rester HORS du try/catch.
  redirect(HOME_BY_ROLE[user.role] ?? '/stock');
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
