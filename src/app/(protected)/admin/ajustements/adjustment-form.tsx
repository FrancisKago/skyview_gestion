'use client';
import { useActionState, useEffect, useRef } from 'react';
import { recordAdjustmentAction } from './actions';

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
    <form ref={formRef} action={action} className="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-2 text-sm">
      <select name="productId" className="border rounded p-2" required defaultValue="">
        <option value="">— produit —</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>)}
      </select>
      <select name="locationId" className="border rounded p-2" required defaultValue="">
        <option value="">— emplacement —</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <input name="qty" type="number" step="0.001" placeholder="Quantité (+/−)"
        className="border rounded p-2" required />
      <input name="reason" placeholder="Motif obligatoire" className="border rounded p-2" required />
      {state.error && <p className="text-red-600 col-span-2">{state.error}</p>}
      {state.success && (
        <p className="text-green-700 font-semibold col-span-2">✅ Ajustement enregistré</p>
      )}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 col-span-2 font-semibold">
        Enregistrer l&apos;ajustement
      </button>
    </form>
  );
}
