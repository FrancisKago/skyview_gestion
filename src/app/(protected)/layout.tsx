import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import type { Role } from '@/lib/auth';
import { TopBar } from '@/components/ui/top-bar';
import { BottomNav, type NavItem } from '@/components/ui/bottom-nav';
import { db } from '@/db';
import { locations } from '@/db/schema';
import { eq } from 'drizzle-orm';

const barmanNav: NavItem[] = [
  { href: '/stock', label: 'Stock', icon: 'stock' },
  { href: '/commandes', label: 'Commandes', icon: 'commandes' },
  { href: '/receptions', label: 'Réceptions', icon: 'receptions' },
  { href: '/sorties', label: 'Sorties', icon: 'sorties' },
  { href: '/inventaire', label: 'Inventaire', icon: 'inventaire' },
];

const NAV: Record<Role, NavItem[]> = {
  magasinier: [{ href: '/livraisons', label: 'Livraisons', icon: 'livraisons' }],
  barman: barmanNav,
  cuisinier: barmanNav,
  comptable: [
    { href: '/compta', label: 'Tableau', icon: 'compta' },
    { href: '/compta/imports', label: 'Ventes', icon: 'imports' },
    { href: '/compta/rapprochements', label: 'Rapproch.', icon: 'rapprochements' },
  ],
  admin: [
    { href: '/admin/produits', label: 'Produits', icon: 'produits' },
    { href: '/admin/articles', label: 'Articles', icon: 'articles' },
    { href: '/admin/utilisateurs', label: 'Comptes', icon: 'utilisateurs' },
    { href: '/admin/ajustements', label: 'Ajustements', icon: 'ajustements' },
    { href: '/admin/imports', label: 'Imports', icon: 'fichiers' },
  ],
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  let locationName: string | null = null;
  if (session.locationId) {
    const [loc] = await db.select().from(locations).where(eq(locations.id, session.locationId));
    locationName = loc?.name ?? null;
  }
  return (
    <div className="min-h-dvh bg-night pb-24">
      <TopBar userName={session.name} locationName={locationName} />
      <main className="p-4 max-w-3xl mx-auto space-y-4">{children}</main>
      <BottomNav items={NAV[session.role] ?? []} />
    </div>
  );
}
