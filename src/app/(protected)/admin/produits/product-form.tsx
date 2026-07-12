'use client';
import { useActionState } from 'react';
import { saveProductAction } from './actions';
import { Input } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';

export function ProductForm() {
  const [state, action, pending] = useActionState(saveProductAction, {});
  return (
    <form action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      <Input name="name" placeholder="Nom du produit *" className="col-span-2" required />
      <Input name="category" placeholder="Catégorie" />
      <Input name="baseUnit" placeholder="Unité de base * (bouteille, kg…)" required />
      <Input name="packName" placeholder="Conditionnement (casier…)" />
      <Input name="packSize" type="number" step="0.001" placeholder="Taille (12)" />
      <Input name="purchasePrice" type="number" placeholder="Prix d'achat FCFA *" required />
      <Input name="alertThreshold" type="number" step="0.001" placeholder="Seuil d'alerte" />
      {state.error && <p className="text-negative col-span-2">{state.error}</p>}
      <Button type="submit" pending={pending} className="col-span-2">
        Enregistrer
      </Button>
    </form>
  );
}
