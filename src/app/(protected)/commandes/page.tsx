import { db } from '@/db';
import { orders, orderLines, products } from '@/db/schema';
import { desc, eq, asc, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getFrequentProducts } from '@/lib/frequent-products';
import { groupProducts } from '@/lib/product-grouping';
import { ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { OrderForm } from './order-form';

export const dynamic = 'force-dynamic';
const STATUS_BADGE: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' }> = {
  en_attente: { label: 'En attente', tone: 'neutral' },
  livree: { label: 'À réceptionner', tone: 'warning' },
  receptionnee: { label: 'Réceptionnée', tone: 'success' },
};

export default async function CommandesPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const prods = await db.select().from(products)
    .where(eq(products.active, true)).orderBy(asc(products.name));

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Commandes au magasin" />
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
    prods.map((p) => ({
      id: p.id, name: p.name, category: p.category, baseUnit: p.baseUnit,
      packName: p.packName, packSize: p.packSize ? Number(p.packSize) : null,
    })),
    freq,
  );

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
      <PageHeader title="Commandes au magasin" />
      <OrderForm groups={groups} />
      {myOrders.length === 0 ? (
        <EmptyState icon={ShoppingCart} message="Aucune commande pour l'instant." />
      ) : (
        <div className="space-y-2">
          {myOrders.map((o) => {
            const badge = STATUS_BADGE[o.status] ?? { label: o.status, tone: 'neutral' as const };
            return (
              <Card key={o.id} className="p-3">
                <div className="flex items-center justify-between font-semibold text-cream">
                  <span>Commande #{o.id}</span>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                <ul className="text-sm text-muted pl-2">
                  {lines.filter((l) => l.orderId === o.id).map((l, i) => (
                    <li key={i}>
                      {l.name} : demandé <span className="tnum">{Number(l.qtyRequested)}</span> {l.baseUnit}
                      {l.qtyDelivered != null && <> — livré <span className="tnum">{Number(l.qtyDelivered)}</span></>}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
