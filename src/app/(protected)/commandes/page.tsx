import { db } from '@/db';
import { orders, orderLines, products } from '@/db/schema';
import { desc, eq, asc, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { OrderForm } from './order-form';

export const dynamic = 'force-dynamic';
const STATUS_LABEL: Record<string, string> = {
  en_attente: '⏳ En attente', livree: '🚚 Livrée — à réceptionner', receptionnee: '✅ Réceptionnée',
};

export default async function CommandesPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const prods = await db.select().from(products)
    .where(eq(products.active, true)).orderBy(asc(products.name));
  const productOptions = prods.map((p) => ({
    id: p.id, name: p.name, baseUnit: p.baseUnit,
    packName: p.packName, packSize: p.packSize ? Number(p.packSize) : null,
  }));

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Commandes au magasin</h1>
        <p className="bg-white rounded-xl shadow p-3 text-sm text-gray-600">
          Aucun emplacement associé à votre compte : cette page est réservée aux comptes
          barman/cuisinier rattachés à un bar ou une cuisine.
        </p>
      </div>
    );
  }

  const myOrders = await db.select().from(orders)
    .where(eq(orders.locationId, session.locationId)).orderBy(desc(orders.createdAt)).limit(20);
  const orderIds = myOrders.map((o) => o.id);
  const lines = orderIds.length
    ? await db.select({
        orderId: orderLines.orderId, qtyRequested: orderLines.qtyRequested,
        qtyDelivered: orderLines.qtyDelivered, name: products.name, baseUnit: products.baseUnit,
      }).from(orderLines).innerJoin(products, eq(orderLines.productId, products.id))
        .where(inArray(orderLines.orderId, orderIds))
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Commandes au magasin</h1>
      <OrderForm products={productOptions} />
      <ul className="space-y-2">
        {myOrders.map((o) => (
          <li key={o.id} className="bg-white rounded-xl shadow p-3 text-sm">
            <div className="flex justify-between font-semibold">
              <span>Commande #{o.id}</span><span>{STATUS_LABEL[o.status]}</span>
            </div>
            <ul className="text-gray-600 pl-2">
              {lines.filter((l) => l.orderId === o.id).map((l, i) => (
                <li key={i}>
                  {l.name} : demandé {Number(l.qtyRequested)} {l.baseUnit}
                  {l.qtyDelivered != null && <> — livré {Number(l.qtyDelivered)}</>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
