'use client';
import { useActionState } from 'react';
import { saveProductAction, type ProductFormState } from './actions';
import { Input } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

export interface ProductFormInitial {
  id: number; name: string; category: string;
  baseUnit: string; packName: string | null; packSize: number | null;
  purchasePrice: number; alertThreshold: number | null; active: boolean;
}

export function ProductForm({ initial }: { initial?: ProductFormInitial }) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProductAction, {});
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les valeurs soumises en defaultValue et la
  // `key` (compteur de tentatives) force le remontage pour les appliquer.
  // En erreur, la saisie soumise (`v`) prime sur `initial` (mode édition) ;
  // après succès en création, l'état vide fait remonter des champs vides.
  const v = state.values;
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Input name="name" placeholder="Nom du produit *" className="col-span-2" defaultValue={v ? v.name : initial?.name} required />
      <Input name="category" placeholder="Catégorie" defaultValue={v ? v.category : initial?.category} />
      <Input name="baseUnit" placeholder="Unité de base * (bouteille, kg…)" defaultValue={v ? v.baseUnit : initial?.baseUnit} required />
      <Input name="packName" placeholder="Conditionnement (casier…)" defaultValue={v ? v.packName : initial?.packName ?? undefined} />
      <Input name="packSize" type="number" step="0.001" placeholder="Taille (12)" defaultValue={v ? v.packSize : initial?.packSize ?? undefined} />
      <Input name="purchasePrice" type="number" placeholder="Prix d'achat FCFA *" defaultValue={v ? v.purchasePrice : initial?.purchasePrice} required />
      <Input name="alertThreshold" type="number" step="0.001" placeholder="Seuil d'alerte" defaultValue={v ? v.alertThreshold : initial?.alertThreshold ?? undefined} />
      <label className="flex items-center gap-2 text-muted col-span-2">
        {/* Case à cocher : 'active' n'est dans `v` que si elle était cochée. */}
        <input type="checkbox" name="active" defaultChecked={v ? v.active === 'on' : initial?.active ?? true} className="size-4 accent-[#c8102e]" />
        Produit actif
      </label>
      <div className="col-span-2"><FormError message={state.error} /></div>
      <Button type="submit" pending={pending} className="col-span-2">
        {initial ? 'Mettre à jour' : 'Enregistrer'}
      </Button>
      {initial && (
        <a href="/admin/produits" className="text-muted underline text-center col-span-2 text-xs">Annuler</a>
      )}
    </form>
  );
}
