'use client';
import { useActionState } from 'react';
import { createUserAction, type UserFormState } from './actions';
import { Input, Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';

export function UserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  return (
    <form action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      <Input name="name" placeholder="Nom complet *" required />
      <Input name="username" placeholder="Identifiant *" required />
      <Input name="password" type="password" placeholder="Mot de passe * (8+ car.)" required />
      <Select name="role" required>
        <option value="magasinier">Magasinier</option>
        <option value="barman">Barman</option>
        <option value="cuisinier">Cuisinier</option>
        <option value="comptable">Comptable</option>
        <option value="admin">Admin</option>
      </Select>
      {state.error && <p className="text-negative col-span-2">{state.error}</p>}
      <Button type="submit" pending={pending} className="col-span-2">
        Créer le compte
      </Button>
    </form>
  );
}
