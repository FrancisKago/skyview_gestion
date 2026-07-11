import { db } from '@/db';
import { salesImports, salesImportLines, saleArticles } from '@/db/schema';
import { desc, isNull, asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { UploadForm } from './upload-form';
import { MatchForm } from './match-form';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  await requireRole(['comptable']);
  const imports = await db.select().from(salesImports)
    .orderBy(desc(salesImports.createdAt)).limit(10);
  const pending = await db.select().from(salesImportLines)
    .where(isNull(salesImportLines.saleArticleId));
  const articles = await db.select().from(saleArticles).orderBy(asc(saleArticles.cashName));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Import des ventes caisse</h1>
      <UploadForm today={today} />
      {pending.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-3 space-y-2 text-sm">
          <p className="font-semibold">⚠️ Articles à faire correspondre :</p>
          {pending.map((l) => (
            <MatchForm key={l.id} lineId={l.id} raw={l.articleNameRaw} qty={Number(l.qty)}
              articles={articles.map((a) => ({ id: a.id, cashName: a.cashName }))} />
          ))}
        </div>
      )}
      <ul className="divide-y bg-white rounded-xl shadow text-sm">
        {imports.map((i) => (
          <li key={i.id} className="p-3">
            <a href={`/compta/rapprochements?importId=${i.id}`} className="text-indigo-700 underline">
              {i.filename}</a> — service du {i.serviceDate}
          </li>
        ))}
      </ul>
    </div>
  );
}
