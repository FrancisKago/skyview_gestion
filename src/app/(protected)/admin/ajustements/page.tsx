import { db } from '@/db';
import { stockMovements, products, locations, users } from '@/db/schema';
import { desc, eq, ne, asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { ListRow } from '@/components/ui/card';
import { MOVEMENT_LABELS } from '@/lib/movement-labels';
import { AdjustmentForm } from './adjustment-form';

export const dynamic = 'force-dynamic';

export default async function AjustementsPage() {
  await requireRole(['admin']);
  const prods = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin'));
  const journal = await db.select({
    id: stockMovements.id, type: stockMovements.type, qty: stockMovements.qty,
    reason: stockMovements.reason, createdAt: stockMovements.createdAt,
    productName: products.name, locName: locations.name, userName: users.name,
  }).from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .innerJoin(locations, eq(stockMovements.locationId, locations.id))
    .innerJoin(users, eq(stockMovements.userId, users.id))
    .orderBy(desc(stockMovements.createdAt)).limit(30);
  return (
    <div className="space-y-4">
      <PageHeader title="Ajustements & journal des mouvements" />
      <AdjustmentForm
        products={prods.map((p: typeof prods[number]) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }))}
        locations={locs.map((l: typeof locs[number]) => ({ id: l.id, name: l.name }))} />
      <div className="space-y-2">
        {journal.map((m: typeof journal[number]) => {
          const qty = Number(m.qty);
          return (
            <ListRow key={m.id} className="text-xs">
              <span>
                <span className="font-semibold text-cream">{m.productName}</span>{' '}
                <span className={`tnum font-semibold ${qty > 0 ? 'text-success' : qty < 0 ? 'text-negative' : ''}`}>
                  {qty > 0 ? '+' : ''}{qty}
                </span>
                <br />
                <span className="text-muted">
                  {m.locName} — {MOVEMENT_LABELS[m.type] ?? m.type} — {m.userName} — {new Date(m.createdAt).toLocaleString('fr-FR')}
                </span>
                {m.reason && <span className="block italic text-muted">Motif : {m.reason}</span>}
              </span>
            </ListRow>
          );
        })}
      </div>
    </div>
  );
}
