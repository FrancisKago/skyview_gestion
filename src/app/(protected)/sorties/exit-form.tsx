'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { recordExitAction } from './actions';
import { ListRow } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input, DateField } from '@/components/ui/fields';
import { FormError } from '@/components/ui/form-error';
import type { ProductGroup } from '@/lib/product-grouping';

type Prod = { id: number; name: string; baseUnit: string };

export function ExitForm({ groups, today }: { groups: Array<ProductGroup<Prod>>; today: string }) {
  const [state, action, pending] = useActionState(recordExitAction, {});
  const [lineCount, setLineCount] = useState(5);
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
  // Les Combobox écoutent l'événement reset natif : formRef.reset() suffit à les vider.
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
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte date et quantités soumises en defaultValue et
  // la `key` (compteur de tentatives) force le remontage du <form> pour les
  // appliquer. Les combobox se réinitialisent via `defaultValue` au remontage
  // `key={attempt}` — le produit soumis revient par `values.lines[i].productId`.
  const v = state.values;
  const count = Math.max(lineCount, v?.lines.length ?? 0);
  // Options aplaties pour le Combobox : l'ordre des groupes (★ Fréquents puis
  // catégories) est préservé par flatMap ; le groupe s'affiche en petit libellé.
  const options = groups.flatMap((g) => g.products.map((p) => ({
    id: p.id, label: p.name, group: g.label, sublabel: p.baseUnit,
  })));
  return (
    <form ref={formRef} key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 space-y-3 text-sm">
      <input type="hidden" name="clientToken" value={token} />
      <label className="flex items-center gap-2">
        <span className="font-semibold text-cream">Date de service :</span>
        <DateField name="serviceDate" defaultValue={v?.serviceDate ?? today} />
      </label>
      <p className="text-xs text-muted">
        Service à cheval sur minuit : gardez la date du jour où le service a commencé.
      </p>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Combobox name="lineProduct" className="flex-1" placeholder="Produit…"
            options={options} defaultValue={v?.lines[i]?.productId || undefined} />
          <Input name="lineQty" type="number" step="0.001" min="0" placeholder="Qté"
            className="w-24" inputMode="decimal" defaultValue={v?.lines[i]?.qty} />
        </div>
      ))}
      <Button variant="ghost" type="button" onClick={() => setLineCount(count + 2)}
        className="min-h-9 px-3 text-xs">+ Ajouter des lignes</Button>
      <FormError message={state.error} />
      {state.success && <p className="text-success font-semibold">Sorties enregistrées ✓</p>}
      {state.warnings?.map((w: string, i: number) => (
        <ListRow key={i} tone="warning" className="text-warning text-sm">{w}</ListRow>
      ))}
      <Button type="submit" pending={pending} className="w-full">
        Valider les sorties du service
      </Button>
    </form>
  );
}
