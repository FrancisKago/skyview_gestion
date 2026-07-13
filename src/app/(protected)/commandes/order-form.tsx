'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createOrderAction } from './actions';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/fields';
import { FormError } from '@/components/ui/form-error';
import type { ProductGroup } from '@/lib/product-grouping';

type Prod = { id: number; name: string; baseUnit: string; packName: string | null; packSize: number | null };

export function OrderForm({ groups }: { groups: Array<ProductGroup<Prod>> }) {
  const [state, action, pending] = useActionState(createOrderAction, {});
  const [lineCount, setLineCount] = useState(3);
  const formRef = useRef<HTMLFormElement>(null);
  // Vide le formulaire après un envoi réussi (le message ✓ reste affiché).
  // Dépendance sur `state` (nouvel objet à chaque retour d'action) et non
  // `state.success` : deux succès consécutifs doivent chacun vider le formulaire.
  // Les Combobox écoutent l'événement reset natif : formRef.reset() suffit à les vider.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les quantités soumises en defaultValue et la
  // `key` (compteur de tentatives) force le remontage du <form> pour les
  // appliquer. Les combobox se réinitialisent via `defaultValue` au remontage
  // `key={attempt}` — le produit soumis revient par `values.lines[i].productId`.
  const v = state.values;
  const count = Math.max(lineCount, v?.lines.length ?? 0);
  // Options aplaties pour le Combobox : l'ordre des groupes (★ Fréquents puis
  // catégories) est préservé par flatMap ; le groupe s'affiche en petit libellé.
  const options = groups.flatMap((g) => g.products.map((p) => ({
    id: p.id, label: p.name, group: g.label,
    sublabel: `${p.baseUnit}${p.packName ? `, ${p.packName}=${p.packSize}` : ''}`,
  })));
  return (
    <form ref={formRef} key={state.attempt ?? 0} action={action} className="bg-card border border-line rounded-xl p-4 space-y-3 text-sm">
      <p className="font-semibold text-cream">Nouvelle commande (en unités de base) :</p>
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
      {state.success && <p className="text-success font-semibold">Commande envoyée ✓</p>}
      <Button type="submit" pending={pending} className="w-full">
        Envoyer la commande
      </Button>
    </form>
  );
}
