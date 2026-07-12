'use client';
import { useActionState, useEffect, useRef } from 'react';
import { recordAdjustmentAction } from './actions';
import { Input, Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';

export function AdjustmentForm({ products, locations }: {
  products: Array<{ id: number; name: string; baseUnit: string }>;
  locations: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState(recordAdjustmentAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Vide le formulaire après un envoi réussi (le message ✅ reste affiché) :
  // cf. src/app/(protected)/commandes/order-form.tsx. Dépendance sur `state`
  // (nouvel objet à chaque retour d'action) et non `state.success` : deux
  // succès consécutifs doivent chacun vider le formulaire.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="bg-card border border-line rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
      <Select name="productId" required defaultValue="">
        <option value="">— produit —</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>)}
      </Select>
      <Select name="locationId" required defaultValue="">
        <option value="">— emplacement —</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      <Input name="qty" type="number" step="0.001" placeholder="Quantité (+/−)" required />
      <Input name="reason" placeholder="Motif obligatoire" required />
      <div className="col-span-2"><FormError message={state.error} /></div>
      {state.success && (
        <p className="text-success font-semibold col-span-2">Ajustement enregistré</p>
      )}
      <Button type="submit" pending={pending} className="col-span-2">
        Enregistrer l&apos;ajustement
      </Button>
    </form>
  );
}
