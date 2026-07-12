import Link from 'next/link';
import { db } from '@/db';
import { orders, locations } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

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
      <PageHeader title="Commandes en attente de livraison" />
      {pending.length === 0 ? (
        <EmptyState icon={Truck} message="Aucune commande en attente." />
      ) : (
        <div className="space-y-2">
          {pending.map((o) => (
            <Link key={o.id} href={`/livraisons/${o.id}`}>
              <Card className="p-4 font-semibold text-cream">
                Commande #{o.id} — {o.locName}
                <span className="block font-normal text-muted text-xs">
                  {new Date(o.createdAt).toLocaleString('fr-FR')}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
