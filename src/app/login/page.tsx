'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-gray-50">
      <form action={action} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-xl font-bold text-center">Skyview — Gestion de stock</h1>
        <input name="username" placeholder="Identifiant" autoComplete="username"
          className="w-full border rounded-lg p-3 text-lg" required />
        <input name="password" type="password" placeholder="Mot de passe" autoComplete="current-password"
          className="w-full border rounded-lg p-3 text-lg" required />
        {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
        <button disabled={pending}
          className="w-full bg-indigo-600 text-white rounded-lg p-3 text-lg font-semibold disabled:opacity-50">
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
