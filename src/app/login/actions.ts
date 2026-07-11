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

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: 'Identifiant ou mot de passe incorrect' };
  }
  let locationId: number | null = null;
  if (user.role === 'barman' || user.role === 'cuisinier') {
    const type = user.role === 'barman' ? 'bar' : 'cuisine';
    const [loc] = await db.select().from(locations).where(eq(locations.type, type));
    locationId = loc?.id ?? null;
  }
  const token = await createSessionToken({
    userId: user.id, role: user.role, name: user.name, locationId,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 12 * 3600,
  });
  redirect(HOME_BY_ROLE[user.role] ?? '/stock');
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
