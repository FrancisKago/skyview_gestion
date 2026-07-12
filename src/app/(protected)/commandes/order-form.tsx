'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createOrderAction } from './actions';
import { SearchBox } from '@/components/ui/search-box';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/fields';
import { matchesQuery } from '@/lib/text';
import type { ProductGroup } from '@/lib/product-grouping';

type Prod = { id: number; name: string; baseUnit: string; packName: string | null; packSize: number | null };

export function OrderForm({ groups }: { groups: Array<ProductGroup<Prod>> }) {
  const [state, action, pending] = useActionState(createOrderAction, {});
  const [lineCount, setLineCount] = useState(3);
  const [query, setQuery] = useState('');
  // Sélection par ligne (index → id produit en chaîne). Selects contrôlés : sans ça,
  // filtrer les options via la recherche ferait perdre silencieusement un choix déjà
  // fait (le <select> non contrôlé retombe sur le placeholder si son option disparaît).
  const [selected, setSelected] = useState<Record<number, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  // Vide le formulaire après un envoi réussi (le message ✓ reste affiché).
  // Dépendance sur `state` (nouvel objet à chaque retour d'action) et non
  // `state.success` : deux succès consécutifs doivent chacun vider le formulaire.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      // Les selects étant contrôlés, formRef.reset() ne suffit plus pour les vider (même
      // schéma que src/app/(protected)/sorties/exit-form.tsx) : réinitialisation en réaction
      // à un événement (succès de soumission), pas une dérivation de state/props affichable
      // au rendu — ça ne peut se faire qu'après commit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected({});
    }
  }, [state]);
  // Options de la ligne i : le produit déjà sélectionné reste épinglé même si la
  // recherche l'exclut — sinon son <option> disparaîtrait et le choix serait perdu.
  const optionsFor = (i: number) => groups
    .map((g) => ({
      ...g,
      products: g.products.filter((p) => matchesQuery(p.name, query) || String(p.id) === (selected[i] ?? '')),
    }))
    .filter((g) => g.products.length > 0);
  return (
    <form ref={formRef} action={action} className="bg-card border border-line rounded-xl p-4 space-y-3 text-sm">
      <p className="font-semibold text-cream">Nouvelle commande (en unités de base) :</p>
      <SearchBox value={query} onChange={setQuery} />
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Select name="lineProduct" className="flex-1" value={selected[i] ?? ''}
            onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.value }))}>
            <option value="">— produit —</option>
            {optionsFor(i).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.baseUnit}{p.packName ? `, ${p.packName}=${p.packSize}` : ''})
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Input name="lineQty" type="number" step="0.001" min="0" placeholder="Qté"
            className="w-24" inputMode="decimal" />
        </div>
      ))}
      <Button variant="ghost" type="button" onClick={() => setLineCount(lineCount + 2)}
        className="min-h-9 px-3 text-xs">+ Ajouter des lignes</Button>
      {state.error && <p className="text-negative">{state.error}</p>}
      {state.success && <p className="text-success font-semibold">Commande envoyée ✓</p>}
      <Button type="submit" pending={pending} className="w-full">
        Envoyer la commande
      </Button>
    </form>
  );
}
