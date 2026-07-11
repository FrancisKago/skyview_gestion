'use client';
import { useActionState, useState } from 'react';
import { saveSaleArticleAction, type ArticleFormState } from './actions';

type Prod = { id: number; name: string; baseUnit: string };

export function ArticleForm({ products, locations }: {
  products: Prod[]; locations: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState<ArticleFormState, FormData>(saveSaleArticleAction, {});
  const [lineCount, setLineCount] = useState(1);
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <input name="cashName" placeholder="Nom exact dans l'export caisse *"
        className="border rounded p-2 w-full" required />
      <select name="locationId" className="border rounded p-2 w-full" required>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <p className="font-semibold">Fiche technique (consommation par vente) :</p>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <select name="lineProduct" className="border rounded p-2 flex-1">
            <option value="">— produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>
            ))}
          </select>
          <input name="lineQty" type="number" step="0.001" placeholder="Qté"
            className="border rounded p-2 w-24" />
        </div>
      ))}
      <button type="button" onClick={() => setLineCount(lineCount + 1)}
        className="text-indigo-600 text-xs underline">+ Ajouter un ingrédient</button>
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Enregistrer l&apos;article
      </button>
    </form>
  );
}
