'use client';
import { useActionState } from 'react';
import { validateInventoryAction } from './actions';

type Line = { productId: number; name: string; baseUnit: string; qtyTheoretical: number };

export function InventoryForm({ stock, today }: { stock: Line[]; today: string }) {
  const [state, action, pending] = useActionState(validateInventoryAction, {});

  if (state.gaps) {
    return (
      <div className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
        <p className="font-bold text-green-700">✅ Inventaire validé — écarts :</p>
        <ul className="divide-y">
          {state.gaps.map((g) => (
            <li key={g.productId} className="py-2 flex justify-between">
              <span>{g.name} : {g.qtyTheoretical} → {g.qtyCounted}</span>
              <span className={g.gap === 0 ? 'text-gray-500' : 'text-red-600 font-semibold'}>
                {g.gap > 0 ? '+' : ''}{g.gap} ({g.gapValue.toLocaleString('fr-FR')} FCFA)
              </span>
            </li>
          ))}
          {state.gaps.length === 0 && (
            <li className="py-2 text-gray-500">Aucun produit compté.</li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="font-semibold">Date :</span>
        <input name="inventoryDate" type="date" defaultValue={today} className="border rounded p-2" />
      </label>
      {stock.map((l) => (
        <div key={l.productId} className="flex justify-between items-center gap-2 border-b py-1">
          <span>{l.name} <span className="text-gray-400">(théorique : {l.qtyTheoretical} {l.baseUnit})</span></span>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <input name="lineCounted" type="number" step="0.001" min="0" placeholder="compté"
            className="border rounded p-2 w-24 text-right" inputMode="decimal" />
        </div>
      ))}
      {stock.length === 0 && (
        <p className="text-gray-500">Aucun mouvement de stock pour l&apos;instant.</p>
      )}
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Valider l&apos;inventaire
      </button>
    </form>
  );
}
