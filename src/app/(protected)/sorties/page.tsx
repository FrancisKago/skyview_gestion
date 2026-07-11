import { db } from '@/db';
import { products, serviceExits } from '@/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { ExitForm } from './exit-form';

export const dynamic = 'force-dynamic';

export default async function SortiesPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const prods = await db.select().from(products)
    .where(eq(products.active, true)).orderBy(asc(products.name));
  const productOptions = prods.map((p) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }));
  const today = new Date().toISOString().slice(0, 10);

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Sorties de fin de service</h1>
        <p className="bg-white rounded-xl shadow p-3 text-sm text-gray-600">
          Aucun emplacement associé à votre compte : cette page est réservée aux comptes
          barman/cuisinier rattachés à un bar ou une cuisine.
        </p>
      </div>
    );
  }

  const recent = await db.select().from(serviceExits)
    .where(eq(serviceExits.locationId, session.locationId))
    .orderBy(desc(serviceExits.createdAt)).limit(5);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Sorties de fin de service</h1>
      <ExitForm today={today} products={productOptions} />
      <div className="text-sm text-gray-500">
        <p className="font-semibold">Dernières saisies :</p>
        <ul>
          {recent.map((e) => (
            <li key={e.id}>
              Service du {e.serviceDate} — saisi le {new Date(e.createdAt).toLocaleString('fr-FR')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
