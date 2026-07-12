import { db } from '@/db';
import { locations, inventories, inventoryLines, products } from '@/db/schema';
import { desc, eq, ne, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getLocationStock, type StockLine } from '@/lib/stock';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { ListRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

export default async function ComptaDashboard() {
  await requireRole(['comptable']);
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin'));
  const stocks = await Promise.all(locs.map(async (loc: typeof locs[number]) => ({
    loc, lines: await getLocationStock(db, loc.id),
  })));
  const lastInventories = await db.select({
    id: inventories.id, date: inventories.inventoryDate, locName: locations.name,
  }).from(inventories)
    .innerJoin(locations, eq(inventories.locationId, locations.id))
    .where(eq(inventories.status, 'valide'))
    .orderBy(desc(inventories.createdAt)).limit(5);
  const lastInventoryIds = lastInventories.map((inv: typeof lastInventories[number]) => inv.id);
  const lastInvGaps = lastInventoryIds.length
    ? await db.select({
        inventoryId: inventoryLines.inventoryId,
        qtyTheoretical: inventoryLines.qtyTheoretical,
        qtyCounted: inventoryLines.qtyCounted,
        price: products.purchasePrice,
      }).from(inventoryLines)
        .innerJoin(products, eq(inventoryLines.productId, products.id))
        .where(inArray(inventoryLines.inventoryId, lastInventoryIds))
    : [];
  const gapValueByInventory = new Map<number, number>();
  for (const l of lastInvGaps) {
    const gap = (Number(l.qtyCounted) - Number(l.qtyTheoretical)) * l.price;
    gapValueByInventory.set(l.inventoryId, Math.round((gapValueByInventory.get(l.inventoryId) ?? 0) + gap));
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord" />
      {stocks.map(({ loc, lines }: { loc: typeof locs[number]; lines: StockLine[] }) => {
        const total = lines.reduce((s, l) => s + l.value, 0);
        const alerts = lines.filter((l) => l.belowThreshold || l.qty < 0);
        return (
          <section key={loc.id} className="space-y-2">
            <StatCard label={loc.name} value={`${total.toLocaleString('fr-FR')} FCFA`} />
            <p className="text-xs text-muted">{lines.length} produit(s) en stock</p>
            {alerts.map((l) => (
              <ListRow key={l.productId} tone={l.qty < 0 ? 'negative' : 'warning'}>
                <span className="flex items-center gap-2">
                  <Badge tone={l.qty < 0 ? 'negative' : 'warning'}>
                    {l.qty < 0 ? 'négatif !' : 'seuil bas'}
                  </Badge>
                  <span className="text-cream">{l.name}</span>
                </span>
                <span className={`tnum font-semibold ${l.qty < 0 ? 'text-negative' : 'text-warning'}`}>
                  {l.qty} {l.baseUnit}
                </span>
              </ListRow>
            ))}
          </section>
        );
      })}
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold text-cream">Derniers inventaires</h2>
        {lastInventories.length === 0 ? (
          <EmptyState icon={ClipboardList} message="Aucun inventaire pour l'instant." />
        ) : (
          <div className="space-y-2">
            {lastInventories.map((inv: typeof lastInventories[number]) => {
              const gap = gapValueByInventory.get(inv.id) ?? 0;
              return (
                <ListRow key={inv.id}>
                  <span className="text-cream">{inv.locName} — {inv.date}</span>
                  <span className={gap < 0 ? 'text-negative tnum font-semibold' : 'text-cream tnum'}>
                    écart : {gap.toLocaleString('fr-FR')} FCFA
                  </span>
                </ListRow>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
