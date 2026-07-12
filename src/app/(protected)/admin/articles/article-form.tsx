'use client';
import { useActionState, useState } from 'react';
import { saveSaleArticleAction, type ArticleFormState } from './actions';
import { Input, Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
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
  return (
    <form action={action} className="bg-card border border-line rounded-xl p-4 space-y-2 text-sm">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Input name="cashName" placeholder="Nom exact dans l'export caisse *"
        className="w-full" defaultValue={initial?.cashName} required />
      {initial && (
        <p className="text-xs text-warning">Attention : le nom caisse doit correspondre exactement à l&apos;export du logiciel de caisse, sinon les prochains imports de ventes ne matcheront plus.</p>
      )}
      <Select name="locationId" className="w-full" defaultValue={initial?.locationId} required>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      <p className="font-semibold text-cream">Fiche technique (consommation par vente) :</p>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Select name="lineProduct" className="flex-1" defaultValue={initial?.lines[i]?.productId ?? ''}>
            <option value="">— produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>
            ))}
          </Select>
          <Input name="lineQty" type="number" step="0.001" placeholder="Qté"
            className="w-24" defaultValue={initial?.lines[i]?.qty ?? ''} />
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setLineCount(lineCount + 1)}
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
