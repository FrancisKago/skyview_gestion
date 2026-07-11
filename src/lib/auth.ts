import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'magasinier' | 'barman' | 'cuisinier' | 'comptable';

// Nom du cookie de session. Défini ici (module pur, sans `next/headers`) pour rester
// importable depuis le middleware (Edge runtime) sans tirer de dépendances serveur.
export const SESSION_COOKIE = 'skyview_session';

export interface Session {
  userId: number;
  role: Role;
  name: string;
  locationId: number | null; // bar ou cuisine pour barman/cuisinier, sinon null
}

const secret = () => {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET requis');
  return new TextEncoder().encode(process.env.SESSION_SECRET);
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as number,
      role: payload.role as Role,
      name: payload.name as string,
      locationId: (payload.locationId as number | null) ?? null,
    };
  } catch {
    return null;
  }
}
