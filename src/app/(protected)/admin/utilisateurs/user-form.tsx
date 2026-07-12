'use client';
import { useActionState } from 'react';
import { createUserAction, type UserFormState } from './actions';
import { Input, Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

export function UserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les valeurs soumises en defaultValue et la
  // `key` (compteur de tentatives) force le remontage pour les appliquer.
  // Le mot de passe n'est pas renvoyé par l'action : il faut le retaper.
  const v = state.values ?? {};
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      <Input name="name" defaultValue={v.name} placeholder="Nom complet *" required />
      <Input name="username" defaultValue={v.username} placeholder="Identifiant *" required />
      <Input name="password" type="password" placeholder="Mot de passe * (8+ car.)" required />
      <Select name="role" defaultValue={v.role} required>
        <option value="magasinier">Magasinier</option>
        <option value="barman">Barman</option>
        <option value="cuisinier">Cuisinier</option>
        <option value="comptable">Comptable</option>
        <option value="admin">Admin</option>
      </Select>
      <div className="col-span-2"><FormError message={state.error} /></div>
      <Button type="submit" pending={pending} className="col-span-2">
        Créer le compte
      </Button>
    </form>
  );
}
