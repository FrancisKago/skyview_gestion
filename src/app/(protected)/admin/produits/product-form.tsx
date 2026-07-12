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
  // Après succès, l'état est vide → les champs remontent vides (souhaité).
  const v = state.values ?? {};
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Input name="name" defaultValue={v.name ?? initial?.name} placeholder="Nom du produit *" className="col-span-2" required />
      <Input name="category" defaultValue={v.category ?? initial?.category} placeholder="Catégorie" />
      <Input name="baseUnit" defaultValue={v.baseUnit ?? initial?.baseUnit} placeholder="Unité de base * (bouteille, kg…)" required />
      <Input name="packName" defaultValue={v.packName ?? initial?.packName ?? undefined} placeholder="Conditionnement (casier…)" />
      <Input name="packSize" defaultValue={v.packSize ?? initial?.packSize ?? undefined} type="number" step="0.001" placeholder="Taille (12)" />
      <Input name="purchasePrice" defaultValue={v.purchasePrice ?? initial?.purchasePrice} type="number" placeholder="Prix d'achat FCFA *" required />
      <Input name="alertThreshold" defaultValue={v.alertThreshold ?? initial?.alertThreshold ?? undefined} type="number" step="0.001" placeholder="Seuil d'alerte" />
      <label className="flex items-center gap-2 text-muted col-span-2">
        {/* Après une erreur, values est défini : l'absence de 'active' signifie décochée. */}
        <input type="checkbox" name="active" defaultChecked={state.values ? v.active === 'on' : (initial?.active ?? true)} className="size-4 accent-[#c8102e]" />
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
