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
  // React 19 réinitialise les champs non contrôlés après chaque soumission,
  // même en erreur : on réinjecte les quantités soumises (indexées par id
  // produit) en defaultValue et la `key` (compteur de tentatives) force le
  // remontage pour les appliquer. En cas de succès, l'action redirige.
  const v = state.values;
  return (
    <form key={state.attempt ?? 0} action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {lines.map((l) => (
        <ListRow key={l.productId} className="text-sm">
          <span className="font-semibold text-cream">{l.name}<br />
            <span className="font-normal text-muted">livré : <span className="tnum">{l.qtyDelivered}</span> {l.baseUnit}</span>
          </span>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <Input name="lineQty" type="number" step="0.001" min="0"
            defaultValue={v?.qty[String(l.productId)] ?? l.qtyDelivered}
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
