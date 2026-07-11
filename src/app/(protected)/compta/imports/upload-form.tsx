'use client';
import { useActionState, useEffect, useRef } from 'react';
import { uploadSalesAction } from './actions';

export function UploadForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(uploadSalesAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Vide le fichier sélectionné après un import réussi (le résumé reste affiché) :
  // cf. src/app/(protected)/sorties/exit-form.tsx.
  useEffect(() => {
    if (state.summary) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <label className="block">
        <span className="font-semibold">Journée de service :</span>
        <input name="serviceDate" type="date" defaultValue={today} className="border rounded p-2 ml-2" required />
      </label>
      <input name="file" type="file" accept=".csv,.xlsx,.xls" className="block w-full" required />
      {state.error && <p className="text-red-600">{state.error}</p>}
      {state.summary && <p className="text-green-700">{state.summary}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Importer les ventes
      </button>
    </form>
  );
}
