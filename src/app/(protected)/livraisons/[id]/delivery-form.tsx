'use client';
import { useActionState } from 'react';
import { deliverOrderAction } from '../actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/fields';
import { FormError } from '@/components/ui/form-error';

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
        <Card key={l.productId} className="p-3 space-y-2 text-sm">
          <p className="font-semibold text-cream">{l.name} — <span className="text-muted font-normal">demandé : <span className="tnum">{l.qtyRequested}</span> {l.baseUnit}</span></p>
          <input type="hidden" name="lineProduct" value={l.productId} />
          {/* packSize volontairement absent du formulaire : la conversion utilise
              la valeur en base côté serveur (cf. ../actions.ts). */}
          <div className="flex gap-2 items-center">
            {l.packSize ? (
              <>
                <Input name="linePacks" type="number" step="0.5" min="0" defaultValue={0}
                  className="w-20 tnum" inputMode="decimal" />
                <span className="text-muted">{l.packName}(s) de {l.packSize} +</span>
              </>
            ) : (
              <input type="hidden" name="linePacks" value="0" />
            )}
            <Input name="lineUnits" type="number" step="0.001" min="0" defaultValue={0}
              className="w-24 tnum" inputMode="decimal" />
            <span className="text-muted">{l.baseUnit}(s)</span>
          </div>
        </Card>
      ))}
      <FormError message={state.error} />
      <Button type="submit" pending={pending} className="w-full">
        Enregistrer la livraison
      </Button>
    </form>
  );
}
