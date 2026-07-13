'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, ShoppingCart, PackageOpen, CalendarClock, ClipboardList,
  Truck, LayoutDashboard, Upload, Scale, Package, ReceiptText, Users, Wrench, FileUp,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  stock: BarChart3, commandes: ShoppingCart, receptions: PackageOpen,
  sorties: CalendarClock, inventaire: ClipboardList, livraisons: Truck,
  compta: LayoutDashboard, imports: Upload, rapprochements: Scale,
  produits: Package, articles: ReceiptText, utilisateurs: Users, ajustements: Wrench,
  fichiers: FileUp, mouvements: ArrowLeftRight,
};

export interface NavItem { href: string; label: string; icon: keyof typeof ICONS }

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const matching = items.filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
  const activeHref = matching.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 bg-card border-t border-line flex justify-around px-1 pt-1.5 pb-2.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === activeHref;
        return (
          <Link key={item.href} href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-[10px] text-[11px] leading-tight
              ${active ? 'text-action font-bold' : 'text-muted hover:text-cream'}`}>
            <Icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
