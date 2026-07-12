import { db } from '@/db';
import { products, serviceExits } from '@/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getFrequentProducts } from '@/lib/frequent-products';
import { groupProducts } from '@/lib/product-grouping';
import { PageHeader } from '@/components/ui/page-header';
import { Card, ListRow } from '@/components/ui/card';
import { ExitForm } from './exit-form';

export const dynamic = 'force-dynamic';

export default async function SortiesPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const prods = await db.select().from(products)
    .where(eq(products.active, true)).orderBy(asc(products.name));
  const today = new Date().toISOString().slice(0, 10);

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Sorties de fin de service" />
        <Card className="p-3">
          <p className="text-sm text-muted">
            Aucun emplacement associé à votre compte : cette page est réservée aux comptes
            barman/cuisinier rattachés à un bar ou une cuisine.
          </p>
        </Card>
      </div>
    );
  }

  const freq = await getFrequentProducts(db, session.locationId!);
  const groups = groupProducts(
    prods.map((p) => ({ id: p.id, name: p.name, category: p.category, baseUnit: p.baseUnit })),
    freq,
  );

  const recent = await db.select().from(serviceExits)
    .where(eq(serviceExits.locationId, session.locationId))
    .orderBy(desc(serviceExits.createdAt)).limit(5);

  return (
    <div className="space-y-4">
      <PageHeader title="Sorties de fin de service" />
      <ExitForm today={today} groups={groups} />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted">Dernières saisies</p>
        {recent.map((e) => (
          <ListRow key={e.id} className="text-sm text-muted">
            <span>
              Service du {e.serviceDate} — saisi le {new Date(e.createdAt).toLocaleString('fr-FR')}
            </span>
          </ListRow>
        ))}
      </div>
    </div>
  );
}
