import Link from 'next/link';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { logout } from '@/app/login/actions';
import type { Role } from '@/lib/auth';

type NavItem = { href: string; label: string };

const barmanNav: NavItem[] = [
  { href: '/stock', label: '📊 Stock' },
  { href: '/commandes', label: '🛒 Commandes' },
  { href: '/receptions', label: '📥 Réceptions' },
  { href: '/sorties', label: '🌙 Sorties' },
  { href: '/inventaire', label: '📋 Inventaire' },
];

const NAV: Record<Role, NavItem[]> = {
  magasinier: [{ href: '/livraisons', label: '📦 Livraisons' }],
  barman: barmanNav,
  cuisinier: barmanNav,
  comptable: [
    { href: '/compta', label: '📊 Tableau de bord' },
    { href: '/compta/imports', label: '📤 Ventes caisse' },
    { href: '/compta/rapprochements', label: '⚖️ Rapprochements' },
  ],
  admin: [
    { href: '/admin/produits', label: '📦 Produits' },
    { href: '/admin/articles', label: '🧾 Articles' },
    { href: '/admin/utilisateurs', label: '👤 Utilisateurs' },
    { href: '/admin/ajustements', label: '🔧 Ajustements' },
  ],
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const items = NAV[session.role] ?? [];
  return (
    <div className="min-h-dvh bg-gray-50 pb-20">
      <header className="bg-indigo-700 text-white p-3 flex justify-between items-center sticky top-0 z-10">
        <span className="font-bold">Skyview</span>
        <form action={logout}>
          <button className="text-sm underline">{session.name} — Déconnexion</button>
        </form>
      </header>
      <main className="p-3 max-w-3xl mx-auto">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex justify-around p-1 z-10">
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className="flex-1 text-center text-xs py-2 rounded hover:bg-indigo-50">
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
