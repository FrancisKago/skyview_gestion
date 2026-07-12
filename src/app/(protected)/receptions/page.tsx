import Link from 'next/link';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { PackageOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

export default async function ReceptionsPage() {
  const session = await requireRole(['barman', 'cuisinier']);

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Livraisons à confirmer" />
        <Card className="p-3">
          <p className="text-sm text-muted">
            Aucun emplacement associé à votre compte : cette page est réservée aux comptes
            barman/cuisinier rattachés à un bar ou une cuisine.
          </p>
        </Card>
      </div>
    );
  }

  const toReceive = await db.select().from(orders)
    .where(and(eq(orders.status, 'livree'), eq(orders.locationId, session.locationId)))
    .orderBy(asc(orders.deliveredAt));
  return (
    <div className="space-y-4">
      <PageHeader title="Livraisons à confirmer" />
      {toReceive.length === 0 ? (
        <EmptyState icon={PackageOpen} message="Rien à réceptionner." actionHref="/commandes" actionLabel="Passer une commande" />
      ) : (
        <div className="space-y-2">
          {toReceive.map((o) => (
            <Link key={o.id} href={`/receptions/${o.id}`}>
              <Card className="p-4 font-semibold text-cream">
                Commande #{o.id}
                <span className="block font-normal text-muted">
                  livrée le {o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('fr-FR') : ''}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
