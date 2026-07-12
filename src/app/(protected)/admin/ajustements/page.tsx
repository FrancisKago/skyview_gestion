import { db } from '@/db';
import { stockMovements, products, locations, users } from '@/db/schema';
import { desc, eq, ne, asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
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
      <h1 className="text-lg font-bold">Ajustements &amp; journal des mouvements</h1>
      <AdjustmentForm
        products={prods.map((p: typeof prods[number]) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }))}
        locations={locs.map((l: typeof locs[number]) => ({ id: l.id, name: l.name }))} />
      <ul className="divide-y bg-white rounded-xl shadow text-xs">
        {journal.map((m: typeof journal[number]) => (
          <li key={m.id} className="p-2">
            <b>{m.productName}</b> — {m.locName} — {Number(m.qty) > 0 ? '+' : ''}{Number(m.qty)}
            — {m.type} — {m.userName} — {new Date(m.createdAt).toLocaleString('fr-FR')}
            {m.reason && <em className="block text-gray-500">Motif : {m.reason}</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}
