import { ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/db';
import { saleArticles, recipeLines, products, locations } from '@/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getReferencedArticleIds } from '@/lib/sale-articles';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ArticleForm } from './article-form';
import { ArticleActions } from './article-actions';

export const dynamic = 'force-dynamic';

export default async function ArticlesPage({ searchParams }: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireRole(['admin']);
  const { edit } = await searchParams;
  const editId = edit != null && Number.isFinite(Number(edit)) ? Number(edit) : null;
  const editing = editId != null
    ? (await db.select().from(saleArticles).where(eq(saleArticles.id, editId)))[0]
    : undefined;
  const editingLines = editing
    ? await db.select().from(recipeLines).where(eq(recipeLines.saleArticleId, editing.id))
    : [];
  const arts = await db.select({
    id: saleArticles.id, cashName: saleArticles.cashName, active: saleArticles.active,
    locName: locations.name,
  }).from(saleArticles)
    .innerJoin(locations, eq(saleArticles.locationId, locations.id))
    .orderBy(asc(saleArticles.cashName));
  const referenced = await getReferencedArticleIds(db);
  const lines = await db.select({
    saleArticleId: recipeLines.saleArticleId, qty: recipeLines.qty,
    productName: products.name, baseUnit: products.baseUnit,
  }).from(recipeLines).innerJoin(products, eq(recipeLines.productId, products.id));
  const prods = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  // Produits référencés par la fiche en cours d'édition mais désactivés depuis :
  // sans eux, le <Select> de la ligne n'aurait pas d'<option> correspondante et
  // retomberait silencieusement sur « — produit — », rendant la fiche impossible
  // à sauver (« Ligne incomplète … » au submit).
  const missingIds = [...new Set(editingLines.map((l) => l.productId))]
    .filter((pid) => !prods.some((p) => p.id === pid));
  const inactiveRefs = missingIds.length
    ? await db.select().from(products).where(inArray(products.id, missingIds))
    : [];
  const locs = await db.select().from(locations);
  return (
    <div className="space-y-4">
      <PageHeader title="Articles de vente & fiches techniques" />
      <ArticleForm
        key={editing?.id ?? 'new'}
        products={[
          ...prods.map((p) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit })),
          ...inactiveRefs.map((p) => ({ id: p.id, name: `${p.name} (inactif)`, baseUnit: p.baseUnit })),
        ]}
        locations={locs.filter((l) => l.type !== 'magasin').map((l) => ({ id: l.id, name: l.name }))}
        initial={editing ? {
          id: editing.id, cashName: editing.cashName, locationId: editing.locationId,
          lines: editingLines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })),
        } : undefined}
      />
      {arts.length === 0 ? (
        <EmptyState icon={ReceiptText} message="Aucun article de vente — créez-en un ci-dessus." />
      ) : (
        <div className="space-y-2">
          {arts.map((a) => (
            <Card key={a.id} className="p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  <span className="font-semibold text-cream">{a.cashName}</span>
                  {!a.active && <span className="ml-2 align-middle"><Badge tone="neutral">archivé</Badge></span>}{' '}
                  <span className="text-muted">({a.locName})</span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <Link href={`/admin/articles?edit=${a.id}`} className="text-action text-xs underline underline-offset-4 shrink-0">Modifier</Link>
                  <ArticleActions id={a.id} name={a.cashName} active={a.active} deletable={!referenced.has(a.id)} />
                </span>
              </div>
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
