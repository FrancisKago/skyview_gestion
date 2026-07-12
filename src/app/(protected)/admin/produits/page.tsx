import { Package } from 'lucide-react';
import { db } from '@/db';
import { products } from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ProductForm } from './product-form';
import { ProductList } from './product-list';

export const dynamic = 'force-dynamic';

export default async function ProduitsPage() {
  await requireRole(['admin']);
  const rows = await db.select().from(products).orderBy(asc(products.name));
  return (
    <div className="space-y-4">
      <PageHeader title="Produits" />
      <ProductForm />
      {rows.length === 0 ? (
        <EmptyState icon={Package} message="Aucun produit — créez le premier ci-dessus." />
      ) : (
        <ProductList products={rows.map((p) => ({
          id: p.id, name: p.name, baseUnit: p.baseUnit,
          packName: p.packName, packSize: p.packSize == null ? null : Number(p.packSize),
          purchasePrice: Number(p.purchasePrice), active: p.active,
        }))} />
      )}
    </div>
  );
}
