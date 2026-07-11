'use client';
import { useActionState } from 'react';
import { deliverOrderAction } from '../actions';

type Line = {
  productId: number; name: string; baseUnit: string; qtyRequested: number;
  packName: string | null; packSize: number | null;
};

export function DeliveryForm({ orderId, lines }: { orderId: number; lines: Line[] }) {
  const [state, action, pending] = useActionState(deliverOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {lines.map((l) => (
        <div key={l.productId} className="bg-white rounded-xl shadow p-3 text-sm space-y-2">
          <p className="font-semibold">{l.name} — demandé : {l.qtyRequested} {l.baseUnit}</p>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <input type="hidden" name="linePackSize" value={l.packSize ?? ''} />
          <div className="flex gap-2 items-center">
            {l.packSize ? (
              <>
                <input name="linePacks" type="number" step="0.5" min="0" defaultValue={0}
                  className="border rounded p-2 w-20" inputMode="decimal" />
                <span>{l.packName}(s) de {l.packSize} +</span>
              </>
            ) : (
              <input type="hidden" name="linePacks" value="0" />
            )}
            <input name="lineUnits" type="number" step="0.001" min="0" defaultValue={0}
              className="border rounded p-2 w-24" inputMode="decimal" />
            <span>{l.baseUnit}(s)</span>
          </div>
        </div>
      ))}
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending}
        className="bg-indigo-600 text-white rounded-lg p-3 w-full font-semibold">
        Enregistrer la livraison
      </button>
    </form>
  );
}
