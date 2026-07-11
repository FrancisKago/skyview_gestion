'use client';
import { useActionState } from 'react';
import { createUserAction, type UserFormState } from './actions';

export function UserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-2 text-sm">
      <input name="name" placeholder="Nom complet *" className="border rounded p-2" required />
      <input name="username" placeholder="Identifiant *" className="border rounded p-2" required />
      <input name="password" type="password" placeholder="Mot de passe * (8+ car.)" className="border rounded p-2" required />
      <select name="role" className="border rounded p-2" required>
        <option value="magasinier">Magasinier</option>
        <option value="barman">Barman</option>
        <option value="cuisinier">Cuisinier</option>
        <option value="comptable">Comptable</option>
        <option value="admin">Admin</option>
      </select>
      {state.error && <p className="text-red-600 col-span-2">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 col-span-2 font-semibold">
        Créer le compte
      </button>
    </form>
  );
}
