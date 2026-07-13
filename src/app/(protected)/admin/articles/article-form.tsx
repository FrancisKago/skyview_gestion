'use client';
import { useActionState, useState } from 'react';
import { saveSaleArticleAction, type ArticleFormState } from './actions';
import { Input, Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { FormError } from '@/components/ui/form-error';

type Prod = { id: number; name: string; baseUnit: string };

export interface ArticleFormInitial {
  id: number; cashName: string; locationId: number;
  lines: Array<{ productId: number; qty: number }>;
}

export function ArticleForm({ products, locations, initial }: {
  products: Prod[]; locations: Array<{ id: number; name: string }>;
  initial?: ArticleFormInitial;
}) {
  const [state, action, pending] = useActionState<ArticleFormState, FormData>(saveSaleArticleAction, {});
  const [lineCount, setLineCount] = useState(initial?.lines.length || 1);
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les valeurs soumises en defaultValue et la
  // `key` (compteur de tentatives) force le remontage pour les appliquer.
  // En erreur, la saisie soumise (`v`) prime sur `initial` (mode édition) ;
  // après succès en création, l'état vide fait remonter des champs vides.
  const v = state.values;
  const count = Math.max(lineCount, v?.lines.length ?? 0);
  // Options du Combobox : les noms « (inactif) » injectés par la page en
  // édition sont des labels comme les autres.
  const options = products.map((p) => ({ id: p.id, label: p.name, sublabel: p.baseUnit }));
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 space-y-2 text-sm">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Input name="cashName" placeholder="Nom exact dans l'export caisse *"
        className="w-full" defaultValue={v ? v.cashName : initial?.cashName} required />
      {initial && (
        <p className="text-xs text-warning">Attention : le nom caisse doit correspondre exactement à l&apos;export du logiciel de caisse, sinon les prochains imports de ventes ne matcheront plus.</p>
      )}
      <Select name="locationId" className="w-full" defaultValue={v ? v.locationId : initial?.locationId} required>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      <p className="font-semibold text-cream">Fiche technique (consommation par vente) :</p>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Combobox name="lineProduct" className="flex-1" placeholder="Produit…"
            options={options}
            defaultValue={v ? v.lines[i]?.productId : initial?.lines[i]?.productId} />
          <Input name="lineQty" type="number" step="0.001" placeholder="Qté"
            className="w-24" defaultValue={v ? v.lines[i]?.qty ?? '' : initial?.lines[i]?.qty ?? ''} />
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setLineCount(count + 1)}
        className="min-h-9 px-3 text-xs">+ Ajouter un ingrédient</Button>
      <FormError message={state.error} />
      <Button type="submit" pending={pending} className="w-full">
        {initial ? "Mettre à jour l'article" : "Enregistrer l'article"}
      </Button>
      {initial && (
        <a href="/admin/articles" className="text-muted underline text-center block text-xs">Annuler</a>
      )}
    </form>
  );
}
