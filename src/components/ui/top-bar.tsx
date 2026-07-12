import { logout } from '@/app/login/actions';
import { LogOut } from 'lucide-react';

export function TopBar({ userName, locationName }: { userName: string; locationName: string | null }) {
  return (
    <header className="sticky top-0 z-10 bg-night/95 backdrop-blur border-b border-line px-4 py-3 flex items-center justify-between">
      <span className="font-display text-lg font-bold text-cream">
        Sky<span className="text-action">v</span>iew
      </span>
      <form action={logout} className="flex items-center gap-2 text-sm text-muted">
        <span>{userName}{locationName ? ` · ${locationName}` : ''}</span>
        <button className="p-2 rounded-[10px] hover:bg-surface" title="Déconnexion" aria-label="Déconnexion">
          <LogOut className="size-4" aria-hidden />
        </button>
      </form>
    </header>
  );
}
