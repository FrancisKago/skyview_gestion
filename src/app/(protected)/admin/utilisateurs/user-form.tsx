'use client';
import { useActionState } from 'react';
import { createUserAction, updateUserAction, type UserFormState } from './actions';
import { Input, Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

export interface UserFormInitial {
  id: number; name: string; username: string; role: string;
}

export function UserForm({ initial }: { initial?: UserFormInitial }) {
  // L'action ne change jamais pendant la vie du formulaire : page.tsx remonte
  // le composant via key={editing?.id ?? 'new'} à chaque bascule création/édition.
  const [state, action, pending] = useActionState<UserFormState, FormData>(
    initial ? updateUserAction : createUserAction, {});
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les valeurs soumises en defaultValue et la
  // `key` (compteur de tentatives) force le remontage pour les appliquer.
  // Le mot de passe n'est pas renvoyé par l'action : il faut le retaper.
  const v = state.values ?? {};
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Input name="name" defaultValue={v.name ?? initial?.name} placeholder="Nom complet *" required />
      {initial ? (
        <p className="text-muted text-sm self-center">@{initial.username}</p>
      ) : (
        <Input name="username" defaultValue={v.username} placeholder="Identifiant *" required />
      )}
      {initial ? (
        <Input name="password" type="password" placeholder="Nouveau mot de passe (laisser vide pour conserver)" />
      ) : (
        <Input name="password" type="password" placeholder="Mot de passe * (8+ car.)" required />
      )}
      <Select name="role" defaultValue={v.role ?? initial?.role} required>
        <option value="magasinier">Magasinier</option>
        <option value="barman">Barman</option>
        <option value="cuisinier">Cuisinier</option>
        <option value="comptable">Comptable</option>
        <option value="admin">Admin</option>
      </Select>
      <div className="col-span-2"><FormError message={state.error} /></div>
      <Button type="submit" pending={pending} className="col-span-2">
        {initial ? 'Mettre à jour' : 'Créer le compte'}
      </Button>
      {initial && (
        <a href="/admin/utilisateurs" className="text-muted underline text-center col-span-2 text-xs">Annuler</a>
      )}
    </form>
  );
}
