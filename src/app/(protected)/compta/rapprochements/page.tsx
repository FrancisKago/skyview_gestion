import { db } from '@/db';
import { locations, salesImports } from '@/db/schema';
import { desc, ne } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getReconciliationReport } from '@/lib/sales-imports';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Scale } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RapprochementsPage({ searchParams }: {
  searchParams: Promise<{ importId?: string }>;
}) {
  await requireRole(['comptable']);
  const { importId } = await searchParams;
  const imports = await db.select().from(salesImports).orderBy(desc(salesImports.createdAt)).limit(10);
  const selected = importId ? Number(importId) : imports[0]?.id;
  if (!selected || !Number.isFinite(selected)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Rapprochement ventes ↔ sorties" />
        <EmptyState icon={Scale} message="Importez d'abord un fichier de ventes."
          actionHref="/compta/imports" actionLabel="Aller aux imports" />
      </div>
    );
  }
  // Seuls le bar et la cuisine vendent (le magasin n'a pas d'articles de vente rattachés).
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin'));
  const reports = await Promise.all(locs.map(async (loc) => ({
    loc,
    report: await getReconciliationReport(db, { importId: selected, locationId: loc.id }),
  })));
  // unmatchedCount est une propriété de l'IMPORT (lignes non reconnues, tous emplacements
  // confondus), identique dans chaque rapport : on l'affiche UNE fois, pas par section.
  const unmatchedCount = reports[0]?.report.unmatchedCount ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader title="Rapprochement ventes ↔ sorties" />
      {imports.length > 1 && (
        <ul className="flex gap-2 flex-wrap text-sm">
          {imports.map((i) => (
            <li key={i.id}>
              <a href={`/compta/rapprochements?importId=${i.id}`}
                className={`inline-block rounded-full px-3 py-1 ${
                  i.id === selected ? 'bg-action text-white' : 'border border-line text-muted hover:text-cream'
                }`}>
                {i.filename} ({i.serviceDate})
              </a>
            </li>
          ))}
        </ul>
      )}
      {unmatchedCount > 0 && (
        <Card tone="warning" className="p-3 text-warning text-sm">
          {unmatchedCount} article(s) non reconnu(s) — exclus du rapprochement,{' '}
          <a href="/compta/imports" className="underline underline-offset-4">à associer dans Ventes caisse</a>.
        </Card>
      )}
      {reports.map(({ loc, report }) => (
        <section key={loc.id} className="space-y-2">
          <h2 className="font-display text-lg font-bold text-cream">{loc.name}</h2>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted text-xs uppercase tracking-wider">
                <th className="p-2">Produit</th><th>Théorique</th><th>Déclaré</th><th>Écart</th><th className="text-right p-2">FCFA</th>
              </tr></thead>
              <tbody>
                {report.lines.map((l) => (
                  <tr key={l.productId} className={`border-t border-line ${l.gap !== 0 ? 'bg-negative/10' : ''}`}>
                    <td className="p-2 text-cream">{l.name}</td>
                    <td className="tnum text-cream">{l.theoretical} {l.baseUnit}</td>
                    <td className="tnum text-cream">{l.declared}</td>
                    <td className={l.gap !== 0 ? 'text-negative tnum font-semibold' : 'tnum text-cream'}>
                      {l.gap > 0 ? '+' : ''}{l.gap}</td>
                    <td className="text-right p-2 tnum text-cream">{l.gapValue.toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <StatCard label={`Écart total valorisé — ${loc.name}`}
            value={`${report.totalGapValue.toLocaleString('fr-FR')} FCFA`}
            tone={report.totalGapValue < 0 ? 'negative' : 'money'} />
        </section>
      ))}
    </div>
  );
}
