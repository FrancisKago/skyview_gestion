import { db } from '@/db';
import { orders, orderLines, products, locations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/session';
import { DeliveryForm } from './delivery-form';

export const dynamic = 'force-dynamic';

export default async function LivraisonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['magasinier']);
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) notFound();
  const [order] = await db.select({
    id: orders.id, status: orders.status, locName: locations.name,
  }).from(orders)
    .innerJoin(locations, eq(orders.locationId, locations.id))
    .where(eq(orders.id, orderId));
  if (!order || order.status !== 'en_attente') notFound();
  const lines = await db.select({
    productId: orderLines.productId, qtyRequested: orderLines.qtyRequested,
    name: products.name, baseUnit: products.baseUnit,
    packName: products.packName, packSize: products.packSize,
  }).from(orderLines)
    .innerJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, order.id));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Livraison — Commande #{order.id} ({order.locName})</h1>
      <DeliveryForm orderId={order.id} lines={lines.map((l) => ({
        productId: l.productId, name: l.name, baseUnit: l.baseUnit,
        qtyRequested: Number(l.qtyRequested),
        packName: l.packName, packSize: l.packSize ? Number(l.packSize) : null,
      }))} />
    </div>
  );
}
