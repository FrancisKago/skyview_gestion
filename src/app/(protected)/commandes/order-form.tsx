'use client';
import { useActionState, useState } from 'react';
import { createOrderAction } from './actions';

type Prod = { id: number; name: string; baseUnit: string; packName: string | null; packSize: number | null };

export function OrderForm({ products }: { products: Prod[] }) {
  const [state, action, pending] = useActionState(createOrderAction, {});
  const [lineCount, setLineCount] = useState(3);
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <p className="font-semibold">Nouvelle commande (en unités de base) :</p>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <select name="lineProduct" className="border rounded p-2 flex-1">
            <option value="">— produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.baseUnit}{p.packName ? `, ${p.packName}=${p.packSize}` : ''})
              </option>
            ))}
          </select>
          <input name="lineQty" type="number" step="0.001" min="0" placeholder="Qté"
            className="border rounded p-2 w-24" inputMode="decimal" />
        </div>
      ))}
      <button type="button" onClick={() => setLineCount(lineCount + 2)}
        className="text-indigo-600 text-xs underline">+ Ajouter une ligne</button>
      {state.error && <p className="text-red-600">{state.error}</p>}
      {state.success && <p className="text-green-700 font-semibold">✅ Commande envoyée</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Envoyer la commande
      </button>
    </form>
  );
}
