import { db } from '@/db';
import { salesImports, salesImportLines, saleArticles } from '@/db/schema';
import { desc, isNull, asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { UploadForm } from './upload-form';
import { matchLineAction } from './actions';

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
            <form key={l.id} action={matchLineAction} className="flex gap-2 items-center">
              <input type="hidden" name="lineId" value={l.id} />
              <span className="flex-1">« {l.articleNameRaw} » (qté {Number(l.qty)})</span>
              <select name="cashName" className="border rounded p-1">
                {articles.map((a) => <option key={a.id} value={a.cashName}>{a.cashName}</option>)}
              </select>
              <button className="bg-indigo-600 text-white rounded px-2 py-1 text-xs">Associer</button>
            </form>
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
