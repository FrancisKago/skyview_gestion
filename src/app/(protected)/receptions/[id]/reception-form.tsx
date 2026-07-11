'use client';
import { useActionState } from 'react';
import { receiveOrderAction } from '../actions';

type Line = { productId: number; name: string; baseUnit: string; qtyDelivered: number };

export function ReceptionForm({ orderId, lines }: { orderId: number; lines: Line[] }) {
  const [state, action, pending] = useActionState(receiveOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {lines.map((l) => (
        <div key={l.productId} className="bg-white rounded-xl shadow p-3 text-sm flex items-center justify-between gap-2">
          <span className="font-semibold">{l.name}<br />
            <span className="font-normal text-gray-500">livré : {l.qtyDelivered} {l.baseUnit}</span>
          </span>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <input name="lineQty" type="number" step="0.001" min="0" defaultValue={l.qtyDelivered}
            className="border rounded p-2 w-24 text-right" inputMode="decimal" />
        </div>
      ))}
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending}
        className="bg-green-600 text-white rounded-lg p-3 w-full font-semibold">
        Confirmer la réception (met à jour mon stock)
      </button>
    </form>
  );
}
