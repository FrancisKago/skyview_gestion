'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { recordExitAction } from './actions';
import { SearchBox } from '@/components/ui/search-box';
import { ListRow } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, DateField } from '@/components/ui/fields';
import { matchesQuery } from '@/lib/text';

type Prod = { id: number; name: string; baseUnit: string };
type Group = { label: string; products: Prod[] };

export function ExitForm({ groups, today }: { groups: Group[]; today: string }) {
  const [state, action, pending] = useActionState(recordExitAction, {});
  const [lineCount, setLineCount] = useState(5);
  const [query, setQuery] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  // Jeton d'idempotence : un par soumission, transmis au serveur (cf. recordServiceExit).
  // Un double-clic renvoie le MÊME jeton tant que le formulaire n'a pas été réinitialisé
  // par un succès — le serveur détecte alors le doublon sans créer une seconde sortie.
  const [token, setToken] = useState(() => crypto.randomUUID());
  // Vide le formulaire après un envoi réussi (le message ✅ et les avertissements
  // restent affichés) : cf. src/app/(protected)/commandes/order-form.tsx. Dépendance
  // sur `state` (nouvel objet à chaque retour d'action) et non `state.success` : deux
  // succès consécutifs doivent chacun vider le formulaire. Le jeton est régénéré ici,
  // dans le même effet, pour que la PROCHAINE soumission parte avec un jeton neuf.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      // Génération d'un jeton neuf en réaction à un événement (succès de soumission),
      // pas une dérivation de state/props affichable au rendu — au même titre que
      // formRef.current?.reset() ci-dessus, ça ne peut se faire qu'après commit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(crypto.randomUUID());
    }
  }, [state]);
  const filteredGroups = groups
    .map((g) => ({ ...g, products: g.products.filter((p) => matchesQuery(p.name, query)) }))
    .filter((g) => g.products.length > 0);
  return (
    <form ref={formRef} action={action} className="bg-card border border-line rounded-xl p-4 space-y-3 text-sm">
      <input type="hidden" name="clientToken" value={token} />
      <label className="flex items-center gap-2">
        <span className="font-semibold text-cream">Date de service :</span>
        <DateField name="serviceDate" defaultValue={today} />
      </label>
      <p className="text-xs text-muted">
        Service à cheval sur minuit : gardez la date du jour où le service a commencé.
      </p>
      <SearchBox value={query} onChange={setQuery} />
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Select name="lineProduct" className="flex-1">
            <option value="">— produit —</option>
            {filteredGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>
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
      {state.success && <p className="text-success font-semibold">Sorties enregistrées ✓</p>}
      {state.warnings?.map((w: string, i: number) => (
        <ListRow key={i} tone="warning" className="text-warning text-sm">{w}</ListRow>
      ))}
      <Button pending={pending} className="w-full">
        Valider les sorties du service
      </Button>
    </form>
  );
}
