import Link from 'next/link';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ReceptionsPage() {
  const session = await requireRole(['barman', 'cuisinier']);

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Livraisons à confirmer</h1>
        <p className="bg-white rounded-xl shadow p-3 text-sm text-gray-600">
          Aucun emplacement associé à votre compte : cette page est réservée aux comptes
          barman/cuisinier rattachés à un bar ou une cuisine.
        </p>
      </div>
    );
  }

  const toReceive = await db.select().from(orders)
    .where(and(eq(orders.status, 'livree'), eq(orders.locationId, session.locationId)))
    .orderBy(asc(orders.deliveredAt));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Livraisons à confirmer</h1>
      {toReceive.length === 0 && <p className="text-gray-500">Rien à réceptionner.</p>}
      <ul className="space-y-2">
        {toReceive.map((o) => (
          <li key={o.id}>
            <Link href={`/receptions/${o.id}`}
              className="block bg-white rounded-xl shadow p-4 font-semibold">
              Commande #{o.id} — livrée le {o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('fr-FR') : ''}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
