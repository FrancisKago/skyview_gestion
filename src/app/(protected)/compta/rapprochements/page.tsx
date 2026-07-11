import { db } from '@/db';
import { locations, salesImports } from '@/db/schema';
import { desc, ne } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getReconciliationReport } from '@/lib/sales-imports';

export const dynamic = 'force-dynamic';

export default async function RapprochementsPage({ searchParams }: {
  searchParams: Promise<{ importId?: string }>;
}) {
  await requireRole(['comptable']);
  const { importId } = await searchParams;
  const imports = await db.select().from(salesImports).orderBy(desc(salesImports.createdAt)).limit(10);
  const selected = importId ? Number(importId) : imports[0]?.id;
  if (!selected || !Number.isFinite(selected)) {
    return <p className="text-gray-500">Importez d&apos;abord un fichier de ventes.</p>;
  }
  // Seuls le bar et la cuisine vendent (le magasin n'a pas d'articles de vente rattachés).
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin'));
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold">Rapprochement ventes ↔ sorties</h1>
      {imports.length > 1 && (
        <ul className="flex gap-2 flex-wrap text-xs">
          {imports.map((i) => (
            <li key={i.id}>
              <a href={`/compta/rapprochements?importId=${i.id}`}
                className={`inline-block rounded-full px-3 py-1 border ${
                  i.id === selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'
                }`}>
                {i.filename} ({i.serviceDate})
              </a>
            </li>
          ))}
        </ul>
      )}
      {await Promise.all(locs.map(async (loc) => {
        const report = await getReconciliationReport(db, { importId: selected, locationId: loc.id });
        return (
          <section key={loc.id} className="space-y-2">
            <h2 className="font-semibold">{loc.name}
              {report.unmatchedCount > 0 &&
                <span className="text-amber-600 text-sm"> — {report.unmatchedCount} article(s) non reconnu(s) exclus</span>}
            </h2>
            <table className="w-full bg-white rounded-xl shadow text-sm">
              <thead><tr className="text-left text-gray-500">
                <th className="p-2">Produit</th><th>Théorique</th><th>Déclaré</th><th>Écart</th><th className="text-right p-2">FCFA</th>
              </tr></thead>
              <tbody>
                {report.lines.map((l) => (
                  <tr key={l.productId} className={l.gap !== 0 ? 'bg-red-50' : ''}>
                    <td className="p-2">{l.name}</td>
                    <td>{l.theoretical} {l.baseUnit}</td>
                    <td>{l.declared}</td>
                    <td className={l.gap !== 0 ? 'text-red-600 font-semibold' : ''}>
                      {l.gap > 0 ? '+' : ''}{l.gap}</td>
                    <td className="text-right p-2">{l.gapValue.toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t">
                <td className="p-2" colSpan={4}>Écart total valorisé</td>
                <td className="text-right p-2">{report.totalGapValue.toLocaleString('fr-FR')} FCFA</td>
              </tr></tfoot>
            </table>
          </section>
        );
      }))}
    </div>
  );
}
