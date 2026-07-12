'use client';
import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import type { ImportFormState } from './actions';

export function ImportForm({ action, submitLabel }: {
  action: (prev: ImportFormState, formData: FormData) => Promise<ImportFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.report) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="space-y-3 text-sm">
      <input name="file" type="file" accept=".csv,.xlsx,.xls" required
        className="block w-full text-muted file:mr-3 file:rounded-[10px] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-cream" />
      <label className="flex items-center gap-2 text-muted">
        <input type="checkbox" name="update" className="size-4 accent-[#c8102e]" />
        Mettre à jour les existants
      </label>
      <FormError message={state.error} />
      {state.report && (
        <div className="bg-card border border-line rounded-xl p-3 space-y-1">
          <p className="text-success font-semibold">
            {state.report.created} créé(s) · {state.report.updated} mis à jour · {state.report.ignored} ignoré(s)
            {state.report.duplicates > 0 && ` · ${state.report.duplicates} doublon(s) de fichier`}
            {' · '}{state.report.rejects.length} rejeté(s)
          </p>
          {state.report.rejects.map((r, i) => (
            <p key={i} className="text-negative text-xs">ligne {r.line} : {r.reason}</p>
          ))}
        </div>
      )}
      <Button type="submit" pending={pending} className="w-full">{submitLabel}</Button>
    </form>
  );
}
