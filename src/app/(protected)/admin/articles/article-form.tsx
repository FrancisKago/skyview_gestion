'use client';
import { useActionState, useState } from 'react';
import { saveSaleArticleAction, type ArticleFormState } from './actions';
import { Input, Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

type Prod = { id: number; name: string; baseUnit: string };

export function ArticleForm({ products, locations }: {
  products: Prod[]; locations: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState<ArticleFormState, FormData>(saveSaleArticleAction, {});
  const [lineCount, setLineCount] = useState(1);
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les valeurs soumises en defaultValue et la
  // `key` (compteur de tentatives) force le remontage pour les appliquer.
  // Après succès, l'état est vide → les champs remontent vides (souhaité).
  const v = state.values;
  const count = Math.max(lineCount, v?.lines.length ?? 0);
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 space-y-2 text-sm">
      <Input name="cashName" defaultValue={v?.cashName} placeholder="Nom exact dans l'export caisse *"
        className="w-full" required />
      <Select name="locationId" defaultValue={v?.locationId} className="w-full" required>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      <p className="font-semibold text-cream">Fiche technique (consommation par vente) :</p>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Select name="lineProduct" defaultValue={v?.lines[i]?.productId ?? ''} className="flex-1">
            <option value="">— produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>
            ))}
          </Select>
          <Input name="lineQty" defaultValue={v?.lines[i]?.qty} type="number" step="0.001" placeholder="Qté"
            className="w-24" />
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setLineCount(count + 1)}
        className="min-h-9 px-3 text-xs">+ Ajouter un ingrédient</Button>
      <FormError message={state.error} />
      <Button type="submit" pending={pending} className="w-full">
        Enregistrer l&apos;article
      </Button>
    </form>
  );
}
