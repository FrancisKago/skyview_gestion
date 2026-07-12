'use client';
import { useActionState } from 'react';
import { receiveOrderAction } from '../actions';
import { ListRow } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/fields';
import { FormError } from '@/components/ui/form-error';

type Line = { productId: number; name: string; baseUnit: string; qtyDelivered: number };

export function ReceptionForm({ orderId, lines }: { orderId: number; lines: Line[] }) {
  const [state, action, pending] = useActionState(receiveOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {lines.map((l) => (
        <ListRow key={l.productId} className="text-sm">
          <span className="font-semibold text-cream">{l.name}<br />
            <span className="font-normal text-muted">livré : <span className="tnum">{l.qtyDelivered}</span> {l.baseUnit}</span>
          </span>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <Input name="lineQty" type="number" step="0.001" min="0" defaultValue={l.qtyDelivered}
            className="w-24 text-right tnum" inputMode="decimal" />
        </ListRow>
      ))}
      <FormError message={state.error} />
      <Button type="submit" pending={pending} className="w-full">
        Confirmer la réception
      </Button>
    </form>
  );
}
