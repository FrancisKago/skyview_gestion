import { requireRole } from '@/lib/session';
import { db } from '@/db';
import { getLocationStock } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const session = await requireRole(['barman', 'cuisinier']);

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Mon stock</h1>
        <p className="bg-white rounded-xl shadow p-3 text-sm text-gray-600">
          Aucun emplacement associé à votre compte : cette page est réservée aux comptes
          barman/cuisinier rattachés à un bar ou une cuisine.
        </p>
      </div>
    );
  }

  const stock = await getLocationStock(db, session.locationId);
  const totalValue = stock.reduce((sum, l) => sum + l.value, 0);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Mon stock</h1>
      <p className="bg-indigo-50 rounded-xl p-3 font-semibold">
        Valeur totale : {totalValue.toLocaleString('fr-FR')} FCFA
      </p>
      <ul className="divide-y bg-white rounded-xl shadow">
        {stock.map((l) => (
          <li key={l.productId} className="p-3 text-sm flex justify-between items-center">
            <span>
              <b>{l.name}</b>
              {l.qty < 0 && <span className="ml-2 text-red-600 font-bold">stock négatif !</span>}
              {l.qty >= 0 && l.belowThreshold && <span className="ml-2 text-amber-600 font-bold">seuil bas</span>}
              <br /><span className="text-gray-500">{l.value.toLocaleString('fr-FR')} FCFA</span>
            </span>
            <span className={`text-lg font-bold ${l.qty < 0 ? 'text-red-600' : l.belowThreshold ? 'text-amber-600' : ''}`}>
              {l.qty} {l.baseUnit}
            </span>
          </li>
        ))}
        {stock.length === 0 && <li className="p-3 text-gray-500">Aucun mouvement de stock pour l&apos;instant.</li>}
      </ul>
    </div>
  );
}
