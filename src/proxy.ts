import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE, type Role } from '@/lib/auth';

// Préfixe d'URL -> rôles autorisés (admin passe partout).
const RULES: Array<[string, Role[]]> = [
  ['/admin', ['admin']],
  ['/compta', ['comptable']],
  ['/livraisons', ['magasinier']],
  ['/stock', ['barman', 'cuisinier']],
  ['/commandes', ['barman', 'cuisinier']],
  ['/receptions', ['barman', 'cuisinier']],
  ['/sorties', ['barman', 'cuisinier']],
  ['/inventaire', ['barman', 'cuisinier']],
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = RULES.find(([prefix]) =>
    pathname === prefix || pathname.startsWith(prefix + '/'));
  if (!rule) return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  if (session.role !== 'admin' && !rule[1].includes(session.role)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/compta/:path*', '/livraisons/:path*', '/stock/:path*',
    '/commandes/:path*', '/receptions/:path*', '/sorties/:path*', '/inventaire/:path*'],
};
