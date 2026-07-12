'use client';
import { useActionState, useEffect, useRef } from 'react';
import { uploadSalesAction } from './actions';
import { DateField } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';

export function UploadForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(uploadSalesAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Vide le fichier sélectionné après un import réussi (le résumé reste affiché) :
  // cf. src/app/(protected)/sorties/exit-form.tsx.
  useEffect(() => {
    if (state.summary) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="bg-card border border-line rounded-xl p-4 space-y-2 text-sm">
      <label className="block space-y-1">
        <span className="font-semibold text-cream">Journée de service :</span>
        <DateField name="serviceDate" defaultValue={today} required />
      </label>
      <input name="file" type="file" accept=".csv,.xlsx,.xls" required
        className="block w-full text-muted file:mr-3 file:rounded-[10px] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-cream" />
      {state.error && <p className="text-negative">{state.error}</p>}
      {state.summary && <p className="text-success">{state.summary}</p>}
      <Button type="submit" pending={pending} className="w-full">Importer les ventes</Button>
    </form>
  );
}
