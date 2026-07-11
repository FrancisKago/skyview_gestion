import { db } from '@/db';
import { orders, orderLines, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/session';
import { ReceptionForm } from './reception-form';

export const dynamic = 'force-dynamic';

export default async function ReceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['barman', 'cuisinier']);
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) notFound();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== 'livree' || order.locationId !== session.locationId) notFound();
  const lines = await db.select({
    productId: orderLines.productId, qtyDelivered: orderLines.qtyDelivered,
    name: products.name, baseUnit: products.baseUnit,
  }).from(orderLines)
    .innerJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, order.id));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Confirmer la réception — Commande #{order.id}</h1>
      <p className="text-sm text-gray-600">
        Comptez ce que vous recevez réellement. Un écart avec la quantité livrée sera tracé.
      </p>
      <ReceptionForm orderId={order.id} lines={lines.map((l) => ({
        productId: l.productId, name: l.name, baseUnit: l.baseUnit,
        qtyDelivered: l.qtyDelivered ? Number(l.qtyDelivered) : 0,
      }))} />
    </div>
  );
}
