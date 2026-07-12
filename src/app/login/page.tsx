'use client';
import { useActionState } from 'react';
import { login } from './actions';
import { FormError } from '@/components/ui/form-error';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-night">
      <form action={action}
        className="w-full max-w-sm bg-card border border-line rounded-xl p-8 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="font-display text-3xl font-bold text-cream">
            Sky<span className="text-action">v</span>iew
          </h1>
          <p className="text-muted text-sm italic">Lounge — Gestion de stock</p>
        </div>
        <input name="username" placeholder="Identifiant" autoComplete="username" required
          className="w-full bg-night border border-line rounded-[10px] p-3.5 text-lg text-cream placeholder:text-muted focus:outline-2 focus:outline-action" />
        <input name="password" type="password" placeholder="Mot de passe" autoComplete="current-password" required
          className="w-full bg-night border border-line rounded-[10px] p-3.5 text-lg text-cream placeholder:text-muted focus:outline-2 focus:outline-action" />
        <FormError message={state.error} />
        <button disabled={pending}
          className="w-full min-h-12 bg-action hover:bg-action-hover text-white rounded-[10px] p-3 text-lg font-semibold disabled:opacity-50 transition-colors">
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
