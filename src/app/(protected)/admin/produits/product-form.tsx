'use client';
import { useActionState } from 'react';
import { saveProductAction } from './actions';

export function ProductForm() {
  const [state, action, pending] = useActionState(saveProductAction, {});
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-2 text-sm">
      <input name="name" placeholder="Nom du produit *" className="border rounded p-2 col-span-2" required />
      <input name="category" placeholder="Catégorie" className="border rounded p-2" />
      <input name="baseUnit" placeholder="Unité de base * (bouteille, kg…)" className="border rounded p-2" required />
      <input name="packName" placeholder="Conditionnement (casier…)" className="border rounded p-2" />
      <input name="packSize" type="number" step="0.001" placeholder="Taille (12)" className="border rounded p-2" />
      <input name="purchasePrice" type="number" placeholder="Prix d'achat FCFA *" className="border rounded p-2" required />
      <input name="alertThreshold" type="number" step="0.001" placeholder="Seuil d'alerte" className="border rounded p-2" />
      {state.error && <p className="text-red-600 col-span-2">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 col-span-2 font-semibold">
        Enregistrer
      </button>
    </form>
  );
}
