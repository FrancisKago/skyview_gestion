import { db } from '@/db';
import { locations, inventories, inventoryLines, products } from '@/db/schema';
import { desc, eq, ne, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getLocationStock, type StockLine } from '@/lib/stock';

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
      <h1 className="text-lg font-bold">Tableau de bord</h1>
      {stocks.map(({ loc, lines }: { loc: typeof locs[number]; lines: StockLine[] }) => {
        const total = lines.reduce((s, l) => s + l.value, 0);
        const alerts = lines.filter((l) => l.belowThreshold || l.qty < 0);
        return (
          <section key={loc.id} className="bg-white rounded-xl shadow p-4 space-y-1">
            <div className="flex justify-between font-semibold">
              <span>{loc.name}</span>
              <span>{total.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <p className="text-sm text-gray-500">{lines.length} produit(s) en stock</p>
            {alerts.map((l) => (
              <p key={l.productId} className="text-sm text-amber-700">
                ⚠️ {l.name} : {l.qty} {l.baseUnit}{l.qty < 0 ? ' (négatif !)' : ' (sous le seuil)'}
              </p>
            ))}
          </section>
        );
      })}
      <section className="space-y-1">
        <h2 className="font-semibold">Derniers inventaires</h2>
        <ul className="divide-y bg-white rounded-xl shadow text-sm">
          {lastInventories.map((inv: typeof lastInventories[number]) => (
            <li key={inv.id} className="p-3 flex justify-between">
              <span>{inv.locName} — {inv.date}</span>
              <span className={(gapValueByInventory.get(inv.id) ?? 0) < 0 ? 'text-red-600 font-semibold' : ''}>
                écart : {(gapValueByInventory.get(inv.id) ?? 0).toLocaleString('fr-FR')} FCFA
              </span>
            </li>
          ))}
          {lastInventories.length === 0 && <li className="p-3 text-gray-500">Aucun inventaire pour l&apos;instant.</li>}
        </ul>
      </section>
    </div>
  );
}
