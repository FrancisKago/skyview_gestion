'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { recordExitAction } from './actions';

type Prod = { id: number; name: string; baseUnit: string };

export function ExitForm({ products, today }: { products: Prod[]; today: string }) {
  const [state, action, pending] = useActionState(recordExitAction, {});
  const [lineCount, setLineCount] = useState(5);
  const formRef = useRef<HTMLFormElement>(null);
  // Jeton d'idempotence : un par soumission, transmis au serveur (cf. recordServiceExit).
  // Un double-clic renvoie le MÊME jeton tant que le formulaire n'a pas été réinitialisé
  // par un succès — le serveur détecte alors le doublon sans créer une seconde sortie.
  const [token, setToken] = useState(() => crypto.randomUUID());
  // Vide le formulaire après un envoi réussi (le message ✅ et les avertissements
  // restent affichés) : cf. src/app/(protected)/commandes/order-form.tsx. Dépendance
  // sur `state` (nouvel objet à chaque retour d'action) et non `state.success` : deux
  // succès consécutifs doivent chacun vider le formulaire. Le jeton est régénéré ici,
  // dans le même effet, pour que la PROCHAINE soumission parte avec un jeton neuf.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      // Génération d'un jeton neuf en réaction à un événement (succès de soumission),
      // pas une dérivation de state/props affichable au rendu — au même titre que
      // formRef.current?.reset() ci-dessus, ça ne peut se faire qu'après commit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(crypto.randomUUID());
    }
  }, [state]);
  return (
    <form ref={formRef} action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <input type="hidden" name="clientToken" value={token} />
      <label className="flex items-center gap-2">
        <span className="font-semibold">Date de service :</span>
        <input name="serviceDate" type="date" defaultValue={today} className="border rounded p-2" />
      </label>
      <p className="text-xs text-gray-500">
        Service à cheval sur minuit : gardez la date du jour où le service a commencé.
      </p>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <select name="lineProduct" className="border rounded p-2 flex-1">
            <option value="">— produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>
            ))}
          </select>
          <input name="lineQty" type="number" step="0.001" min="0" placeholder="Qté"
            className="border rounded p-2 w-24" inputMode="decimal" />
        </div>
      ))}
      <button type="button" onClick={() => setLineCount(lineCount + 2)}
        className="text-indigo-600 text-xs underline">+ Ajouter des lignes</button>
      {state.error && <p className="text-red-600">{state.error}</p>}
      {state.success && <p className="text-green-700 font-semibold">✅ Sorties enregistrées</p>}
      {state.warnings?.map((w: string, i: number) => (
        <p key={i} className="text-amber-700 bg-amber-50 rounded p-2">⚠️ {w}</p>
      ))}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Valider les sorties du service
      </button>
    </form>
  );
}
