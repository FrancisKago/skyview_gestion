import { db } from '@/db';
import { locations, products, recipeLines, saleArticles } from '@/db/schema';
import { asc, eq, ne } from 'drizzle-orm';
import Link from 'next/link';
import { requireRole } from '@/lib/session';
import { isValidDateString } from '@/lib/dates';
import { getMovementDetail, getMovementReport } from '@/lib/movement-report';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { DateField, Select } from '@/components/ui/fields';
import { Combobox } from '@/components/ui/combobox';
import { ArrowLeftRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function MouvementsPage({ searchParams }: {
  searchParams: Promise<{
    du?: string; au?: string; emplacement?: string;
    produit?: string; article?: string; detail?: string; detailLoc?: string;
  }>;
}) {
  await requireRole(['comptable']);
  const sp = await searchParams;

  // Défauts : 1er du mois -> aujourd'hui. Paramètre invalide -> défaut du champ (spec §4.1).
  const now = new Date();
  const defaultDu = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultAu = toDateStr(now);
  let du = sp.du && isValidDateString(sp.du) ? sp.du : defaultDu;
  let au = sp.au && isValidDateString(sp.au) ? sp.au : defaultAu;
  if (du > au) { du = defaultDu; au = defaultAu; } // comparaison lexicale valide en ISO

  // Seuls bar et cuisine sont journalisés (le stock magasin n'est pas suivi).
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin')).orderBy(asc(locations.name));
  const emplacementId = Number(sp.emplacement);
  const selectedLocs = locs.some((l) => l.id === emplacementId)
    ? locs.filter((l) => l.id === emplacementId) : locs;

  const allProducts = await db.select({
    id: products.id, name: products.name, active: products.active,
  }).from(products).orderBy(asc(products.name));
  const allArticles = await db.select({
    id: saleArticles.id, cashName: saleArticles.cashName,
  }).from(saleArticles).orderBy(asc(saleArticles.cashName));

  // Produit et article exclusifs : produit gagne (spec §4.1).
  const produitId = Number(sp.produit);
  const produit = allProducts.find((p) => p.id === produitId);
  const articleId = Number(sp.article);
  const article = !produit ? allArticles.find((a) => a.id === articleId) : undefined;
  let productIds: number[] | undefined;
  let articleIngredients: string[] = [];
  if (produit) {
    productIds = [produit.id];
  } else if (article) {
    const lines = await db.select({ productId: recipeLines.productId })
      .from(recipeLines).where(eq(recipeLines.saleArticleId, article.id));
    productIds = [...new Set(lines.map((l) => l.productId))];
    articleIngredients = allProducts
      .filter((p) => productIds!.includes(p.id)).map((p) => p.name);
  }

  const sections = await Promise.all(selectedLocs.map(async (loc) => ({
    loc,
    lines: await getMovementReport(db, { from: du, to: au, locationId: loc.id, productIds }),
  })));

  // Détail : produit + emplacement valides et affichés, sinon carte absente (spec §4.3).
  const detailProductId = Number(sp.detail);
  const detailLocId = Number(sp.detailLoc);
  const detailLoc = selectedLocs.find((l) => l.id === detailLocId);
  const detailProduct = allProducts.find((p) => p.id === detailProductId);
  const detail = detailLoc && detailProduct
    ? await getMovementDetail(db, { from: du, to: au, locationId: detailLoc.id, productId: detailProduct.id })
    : null;

  // Conserve les filtres courants dans les liens détail / fermer.
  const baseQuery = new URLSearchParams();
  baseQuery.set('du', du); baseQuery.set('au', au);
  if (selectedLocs.length === 1) baseQuery.set('emplacement', String(selectedLocs[0].id));
  if (produit) baseQuery.set('produit', String(produit.id));
  else if (article) baseQuery.set('article', String(article.id));
  const detailHref = (locId: number, prodId: number) =>
    `/compta/mouvements?${baseQuery.toString()}&detail=${prodId}&detailLoc=${locId}`;
  const closeHref = `/compta/mouvements?${baseQuery.toString()}`;

  const empty = sections.every((s) => s.lines.length === 0);
  const nf = (n: number) => n.toLocaleString('fr-FR');

  return (
    <div className="space-y-6">
      <PageHeader title="Mouvements de stock"
        subtitle="Stock initial, mouvements et stock final par emplacement sur la période." />

      <Card className="p-4">
        <form method="get" className="grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1"><span className="text-muted text-xs">Du</span>
            <DateField name="du" defaultValue={du} className="w-full" /></label>
          <label className="space-y-1"><span className="text-muted text-xs">Au</span>
            <DateField name="au" defaultValue={au} className="w-full" /></label>
          <label className="space-y-1"><span className="text-muted text-xs">Emplacement</span>
            <Select name="emplacement" defaultValue={selectedLocs.length === 1 ? String(selectedLocs[0].id) : ''} className="w-full">
              <option value="">Tous</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select></label>
          <label className="space-y-1"><span className="text-muted text-xs">Produit</span>
            <Combobox name="produit" placeholder="Tous" className="w-full"
              options={allProducts.map((p) => ({ id: p.id, label: p.name + (p.active ? '' : ' (inactif)') }))}
              defaultValue={produit?.id} /></label>
          <label className="space-y-1 col-span-2"><span className="text-muted text-xs">Article caisse (filtre ses ingrédients)</span>
            <Combobox name="article" placeholder="Tous" className="w-full"
              options={allArticles.map((a) => ({ id: a.id, label: a.cashName }))}
              defaultValue={article?.id} /></label>
          <Button type="submit" className="col-span-2 w-full">Filtrer</Button>
          <a href="/compta/mouvements" className="col-span-2 text-center text-muted underline underline-offset-4 text-xs">
            Réinitialiser</a>
        </form>
      </Card>

      <p className="text-sm text-muted">
        Exporter :{' '}
        <a href={`/compta/mouvements/export?${baseQuery.toString()}&format=csv`}
          className="text-action underline underline-offset-4">CSV</a>
        {' · '}
        <a href={`/compta/mouvements/export?${baseQuery.toString()}&format=xlsx`}
          className="text-action underline underline-offset-4">Excel</a>
      </p>

      {article && (
        <Card tone="warning" className="p-3 text-warning text-sm">
          Filtré sur les ingrédients de « {article.cashName} » : {articleIngredients.join(', ') || 'aucun'}.
        </Card>
      )}

      {empty && <EmptyState icon={ArrowLeftRight} message="Aucun mouvement ni stock sur la période." />}

      {!empty && sections.map(({ loc, lines }) => (
        <section key={loc.id} className="space-y-2">
          <h2 className="font-display text-lg font-bold text-cream">{loc.name}</h2>
          {lines.length === 0 ? (
            <p className="text-muted text-sm">Aucun mouvement ni stock sur la période pour cet emplacement.</p>
          ) : (
            <>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted text-xs uppercase tracking-wider">
                    <th className="p-2">Produit</th><th>Initial</th><th>Récept.</th>
                    <th>Sorties</th><th>Ajust.</th><th>Final</th><th className="text-right p-2">FCFA</th>
                  </tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.productId} className="border-t border-line">
                        <td className="p-2">
                          <Link href={detailHref(loc.id, l.productId)}
                            className="text-action underline underline-offset-4">{l.name}</Link>
                        </td>
                        <td className="tnum text-cream">{l.initial} {l.baseUnit}</td>
                        <td className="tnum text-cream">{l.receptions}</td>
                        <td className="tnum text-cream">{l.sorties}</td>
                        <td className={`tnum ${l.ajustements < 0 ? 'text-negative' : 'text-cream'}`}>
                          {l.ajustements > 0 ? '+' : ''}{l.ajustements}</td>
                        <td className="tnum text-cream font-semibold">{l.final}</td>
                        <td className="text-right p-2 tnum text-cream">{nf(l.finalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <StatCard label={`Valeur du stock — ${loc.name}`}
                value={`${nf(lines.reduce((s, l) => s + l.initialValue, 0))} → ${nf(lines.reduce((s, l) => s + l.finalValue, 0))} FCFA`}
                tone="money" />
            </>
          )}
          {detail && detailLoc?.id === loc.id && detailProduct && (
            <Card className="p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display font-bold text-cream">
                  Journal — {detailProduct.name} ({loc.name})</h3>
                <Link href={closeHref} className="text-muted text-xs underline underline-offset-4">Fermer</Link>
              </div>
              {detail.length === 0 ? (
                <p className="text-muted text-sm">Aucun mouvement sur la période.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.map((d, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-x-3 border-t border-line pt-1 first:border-0 first:pt-0">
                      <span className="text-muted tnum">
                        {d.createdAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span className="text-cream">{d.typeLabel}{d.reason ? ` — ${d.reason}` : ''}</span>
                      <span className={`tnum font-semibold ${d.qty < 0 ? 'text-negative' : 'text-success'}`}>
                        {d.qty > 0 ? '+' : ''}{d.qty}</span>
                      <span className="text-muted text-xs w-full text-right">par {d.userName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </section>
      ))}
    </div>
  );
}
