import Link from 'next/link';
import { db } from '@/db';
import { orders, locations } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LivraisonsPage() {
  await requireRole(['magasinier']);
  const pending = await db.select({
    id: orders.id, createdAt: orders.createdAt, locName: locations.name,
  }).from(orders)
    .innerJoin(locations, eq(orders.locationId, locations.id))
    .where(eq(orders.status, 'en_attente'))
    .orderBy(asc(orders.createdAt));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Commandes en attente de livraison</h1>
      {pending.length === 0 && <p className="text-gray-500">Aucune commande en attente. 👍</p>}
      <ul className="space-y-2">
        {pending.map((o) => (
          <li key={o.id}>
            <Link href={`/livraisons/${o.id}`}
              className="block bg-white rounded-xl shadow p-4 font-semibold">
              Commande #{o.id} — {o.locName}
              <span className="block text-xs text-gray-500 font-normal">
                {new Date(o.createdAt).toLocaleString('fr-FR')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
