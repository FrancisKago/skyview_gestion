'use client';
import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Select, DateField } from '@/components/ui/fields';
import { importInventoryAction, type InventoryImportFormState } from './actions';

export function InventoryImportForm({ locations, today }: {
  locations: Array<{ id: number; name: string }>; today: string;
}) {
  const [state, formAction, pending] = useActionState(importInventoryAction, {} as InventoryImportFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Ne reset qu'en vrai succès : en zéro-valide, error + rapport de rejets coexistent.
    if (state.report && !state.error) formRef.current?.reset();
  }, [state]);
  const nf = (n: number) => n.toLocaleString('fr-FR');
  return (
    <form ref={formRef} action={formAction} className="space-y-3 text-sm">
      <input name="file" type="file" accept=".csv,.xlsx,.xls" required
        className="block w-full text-muted file:mr-3 file:rounded-[10px] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-cream" />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-muted text-xs">Emplacement</span>
          <Select name="locationId" required defaultValue="" className="w-full">
            <option value="" disabled>— emplacement —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select></label>
        <label className="space-y-1"><span className="text-muted text-xs">Date d&apos;inventaire</span>
          <DateField name="inventoryDate" defaultValue={today} required className="w-full" /></label>
      </div>
      <FormError message={state.error} />
      {state.report && (
        <div className="bg-card border border-line rounded-xl p-3 space-y-2">
          <p className={state.error ? 'text-negative font-semibold' : 'text-success font-semibold'}>
            {state.report.counted} produit(s) compté(s)
            {state.report.duplicates > 0 && ` · ${state.report.duplicates} doublon(s) de fichier`}
            {' · '}{state.report.rejects.length} rejeté(s)
          </p>
          {state.report.rejects.map((r, i) => (
            <p key={i} className="text-negative text-xs">ligne {r.line} : {r.reason}</p>
          ))}
          {state.report.gaps.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted uppercase tracking-wider">
                  <th className="p-1">Produit</th><th>Théorique</th><th>Compté</th><th>Écart</th><th className="text-right p-1">FCFA</th>
                </tr></thead>
                <tbody>
                  {state.report.gaps.map((g) => (
                    <tr key={g.productId} className={`border-t border-line ${g.gap !== 0 ? 'bg-negative/10' : ''}`}>
                      <td className="p-1 text-cream">{g.name}</td>
                      <td className="tnum text-cream">{g.qtyTheoretical}</td>
                      <td className="tnum text-cream">{g.qtyCounted}</td>
                      <td className={g.gap !== 0 ? 'text-negative tnum font-semibold' : 'tnum text-cream'}>
                        {g.gap > 0 ? '+' : ''}{g.gap}</td>
                      <td className="text-right p-1 tnum text-cream">{nf(g.gapValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <Button type="submit" pending={pending} className="w-full">Importer l&apos;inventaire</Button>
    </form>
  );
}
