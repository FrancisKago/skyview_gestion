import { requireRole } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { ImportForm } from './import-form';
import { importProductsAction, importArticlesAction } from './actions';

export const dynamic = 'force-dynamic';

function TemplateLinks({ type }: { type: 'produits' | 'articles' }) {
  const base = `/admin/imports/template?type=${type}`;
  return (
    <p className="text-sm text-muted">
      Template :{' '}
      <a href={`${base}&format=xlsx`} className="text-action underline underline-offset-4">Excel (.xlsx)</a>
      {' · '}
      <a href={`${base}&format=csv`} className="text-action underline underline-offset-4">CSV</a>
    </p>
  );
}

export default async function ImportsAdminPage() {
  await requireRole(['admin']);
  return (
    <div className="space-y-4">
      <PageHeader title="Imports"
        subtitle="Téléchargez un template, remplissez-le, puis chargez-le. L'import ne lit que la première feuille." />
      <Card className="p-4 space-y-3">
        <h2 className="font-display text-lg font-bold text-cream">Produits</h2>
        <TemplateLinks type="produits" />
        <ImportForm action={importProductsAction} submitLabel="Importer les produits" />
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-display text-lg font-bold text-cream">Articles & fiches techniques</h2>
        <p className="text-sm text-muted">Une ligne par ingrédient — les produits référencés doivent déjà exister.</p>
        <TemplateLinks type="articles" />
        <ImportForm action={importArticlesAction} submitLabel="Importer les articles" />
      </Card>
    </div>
  );
}
