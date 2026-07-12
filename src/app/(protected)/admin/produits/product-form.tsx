'use client';
import { useActionState } from 'react';
import { saveProductAction } from './actions';
import { Input } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

export interface ProductFormInitial {
  id: number; name: string; category: string;
  baseUnit: string; packName: string | null; packSize: number | null;
  purchasePrice: number; alertThreshold: number | null; active: boolean;
}

export function ProductForm({ initial }: { initial?: ProductFormInitial }) {
  const [state, action, pending] = useActionState(saveProductAction, {});
  return (
    <form action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Input name="name" placeholder="Nom du produit *" className="col-span-2" defaultValue={initial?.name} required />
      <Input name="category" placeholder="Catégorie" defaultValue={initial?.category} />
      <Input name="baseUnit" placeholder="Unité de base * (bouteille, kg…)" defaultValue={initial?.baseUnit} required />
      <Input name="packName" placeholder="Conditionnement (casier…)" defaultValue={initial?.packName ?? undefined} />
      <Input name="packSize" type="number" step="0.001" placeholder="Taille (12)" defaultValue={initial?.packSize ?? undefined} />
      <Input name="purchasePrice" type="number" placeholder="Prix d'achat FCFA *" defaultValue={initial?.purchasePrice} required />
      <Input name="alertThreshold" type="number" step="0.001" placeholder="Seuil d'alerte" defaultValue={initial?.alertThreshold ?? undefined} />
      <label className="flex items-center gap-2 text-muted col-span-2">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="size-4 accent-[#c8102e]" />
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
