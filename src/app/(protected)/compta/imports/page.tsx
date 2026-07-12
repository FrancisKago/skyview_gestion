import { db } from '@/db';
import { salesImports, salesImportLines, saleArticles } from '@/db/schema';
import { desc, isNull, asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { UploadForm } from './upload-form';
import { MatchForm } from './match-form';
import { Upload } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, ListRow } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

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
      <PageHeader title="Import des ventes caisse" />
      <UploadForm today={today} />
      {pending.length > 0 && (
        <Card tone="warning" className="p-3 space-y-2">
          <p className="font-semibold text-warning">Articles à faire correspondre :</p>
          {pending.map((l) => (
            <MatchForm key={l.id} lineId={l.id} raw={l.articleNameRaw} qty={Number(l.qty)}
              articles={articles.map((a) => ({ id: a.id, cashName: a.cashName }))} />
          ))}
        </Card>
      )}
      {imports.length === 0 ? (
        <EmptyState icon={Upload} message="Aucun import pour l'instant." />
      ) : (
        <div className="space-y-2">
          {imports.map((i) => (
            <ListRow key={i.id}>
              <a href={`/compta/rapprochements?importId=${i.id}`} className="text-action underline underline-offset-4">
                {i.filename}
              </a>
              <span className="text-muted">service du {i.serviceDate}</span>
            </ListRow>
          ))}
        </div>
      )}
    </div>
  );
}
