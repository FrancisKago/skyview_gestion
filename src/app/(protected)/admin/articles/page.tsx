import { db } from '@/db';
import { saleArticles, recipeLines, products, locations } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { ArticleForm } from './article-form';

export const dynamic = 'force-dynamic';

export default async function ArticlesPage() {
  await requireRole(['admin']);
  const arts = await db.select({
    id: saleArticles.id, cashName: saleArticles.cashName, locName: locations.name,
  }).from(saleArticles)
    .innerJoin(locations, eq(saleArticles.locationId, locations.id))
    .orderBy(asc(saleArticles.cashName));
  const lines = await db.select({
    saleArticleId: recipeLines.saleArticleId, qty: recipeLines.qty,
    productName: products.name, baseUnit: products.baseUnit,
  }).from(recipeLines).innerJoin(products, eq(recipeLines.productId, products.id));
  const prods = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const locs = await db.select().from(locations);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Articles de vente & fiches techniques</h1>
      <ArticleForm
        products={prods.map((p) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }))}
        locations={locs.filter((l) => l.type !== 'magasin').map((l) => ({ id: l.id, name: l.name }))}
      />
      <ul className="divide-y bg-white rounded-xl shadow">
        {arts.map((a) => (
          <li key={a.id} className="p-3 text-sm">
            <b>{a.cashName}</b> <span className="text-gray-500">({a.locName})</span>
            <ul className="text-gray-600 pl-4">
              {lines.filter((l) => l.saleArticleId === a.id).map((l, i) => (
                <li key={i}>• {Number(l.qty)} {l.baseUnit} — {l.productName}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
