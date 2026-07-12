'use client';
import { useActionState } from 'react';
import { saveProductAction, type ProductFormState } from './actions';
import { Input } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

export function ProductForm() {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProductAction, {});
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les valeurs soumises en defaultValue et la
  // `key` (compteur de tentatives) force le remontage pour les appliquer.
  // Après succès, l'état est vide → les champs remontent vides (souhaité).
  const v = state.values ?? {};
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      <Input name="name" defaultValue={v.name} placeholder="Nom du produit *" className="col-span-2" required />
      <Input name="category" defaultValue={v.category} placeholder="Catégorie" />
      <Input name="baseUnit" defaultValue={v.baseUnit} placeholder="Unité de base * (bouteille, kg…)" required />
      <Input name="packName" defaultValue={v.packName} placeholder="Conditionnement (casier…)" />
      <Input name="packSize" defaultValue={v.packSize} type="number" step="0.001" placeholder="Taille (12)" />
      <Input name="purchasePrice" defaultValue={v.purchasePrice} type="number" placeholder="Prix d'achat FCFA *" required />
      <Input name="alertThreshold" defaultValue={v.alertThreshold} type="number" step="0.001" placeholder="Seuil d'alerte" />
      <div className="col-span-2"><FormError message={state.error} /></div>
      <Button type="submit" pending={pending} className="col-span-2">
        Enregistrer
      </Button>
    </form>
  );
}
