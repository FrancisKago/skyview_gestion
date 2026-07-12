'use client';
import { useActionState, useState } from 'react';
import { validateInventoryAction } from './actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, DateField } from '@/components/ui/fields';
import { FormError } from '@/components/ui/form-error';
import { SearchBox } from '@/components/ui/search-box';
import { matchesQuery } from '@/lib/text';

type Line = { productId: number; name: string; baseUnit: string; qtyTheoretical: number };

export function InventoryForm({ stock, today }: { stock: Line[]; today: string }) {
  const [state, action, pending] = useActionState(validateInventoryAction, {});
  const [query, setQuery] = useState('');

  if (state.gaps) {
    return (
      <Card className="p-4 space-y-2 text-sm">
        <p className="font-bold text-success">Inventaire validé — écarts :</p>
        <ul className="divide-y divide-line">
          {state.gaps.map((g) => (
            <li key={g.productId} className="py-2 flex justify-between">
              <span className="text-cream">{g.name} : <span className="tnum">{g.qtyTheoretical}</span> → <span className="tnum">{g.qtyCounted}</span></span>
              <span className={g.gap === 0 ? 'text-muted tnum' : 'text-negative font-semibold tnum'}>
                {g.gap > 0 ? '+' : ''}{g.gap} ({g.gapValue.toLocaleString('fr-FR')} FCFA)
              </span>
            </li>
          ))}
          {state.gaps.length === 0 && (
            <li className="py-2 text-muted">Aucun produit compté.</li>
          )}
        </ul>
      </Card>
    );
  }

  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte date et quantités comptées (indexées par id
  // produit) en defaultValue et la `key` (compteur de tentatives) force le
  // remontage pour les appliquer.
  const v = state.values;
  return (
    <form key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="font-semibold text-cream">Date :</span>
        <DateField name="inventoryDate" defaultValue={v?.inventoryDate ?? today} />
      </label>
      <SearchBox value={query} onChange={setQuery} />
      {stock.map((l) => {
        const match = matchesQuery(l.name, query);
        return (
          <div key={l.productId}
            className={match ? 'flex justify-between items-center gap-2 border-b border-line py-1' : 'hidden'}>
            <span className="text-cream">{l.name} <span className="text-muted">(théorique : <span className="tnum">{l.qtyTheoretical}</span> {l.baseUnit})</span></span>
            <input type="hidden" name="lineProduct" value={l.productId} />
            <Input name="lineCounted" type="number" step="0.001" min="0" placeholder="compté"
              className="w-24 text-right tnum" inputMode="decimal"
              defaultValue={v?.counted[String(l.productId)]} />
          </div>
        );
      })}
      {stock.length === 0 && (
        <p className="text-muted">Aucun mouvement de stock pour l&apos;instant.</p>
      )}
      <FormError message={state.error} />
      <Button type="submit" pending={pending} className="w-full">
        Valider l&apos;inventaire
      </Button>
    </form>
  );
}
