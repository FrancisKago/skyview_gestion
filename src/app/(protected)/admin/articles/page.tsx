import { ReceiptText } from 'lucide-react';
import { db } from '@/db';
import { saleArticles, recipeLines, products, locations } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
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
      <PageHeader title="Articles de vente & fiches techniques" />
      <ArticleForm
        products={prods.map((p) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }))}
        locations={locs.filter((l) => l.type !== 'magasin').map((l) => ({ id: l.id, name: l.name }))}
      />
      {arts.length === 0 ? (
        <EmptyState icon={ReceiptText} message="Aucun article de vente — créez-en un ci-dessus." />
      ) : (
        <div className="space-y-2">
          {arts.map((a) => (
            <Card key={a.id} className="p-3 text-sm">
              <span className="font-semibold text-cream">{a.cashName}</span>{' '}
              <span className="text-muted">({a.locName})</span>
              <ul className="text-muted pl-4 mt-1">
                {lines.filter((l) => l.saleArticleId === a.id).map((l, i) => (
                  <li key={i}>• <span className="tnum">{Number(l.qty)}</span> {l.baseUnit} — {l.productName}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
