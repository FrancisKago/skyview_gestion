import { PackageSearch } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { db } from '@/db';
import { getLocationStock } from '@/lib/stock';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StockList } from './stock-list';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const session = await requireRole(['barman', 'cuisinier']);

  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mon stock" />
        <Card className="p-3">
          <p className="text-sm text-muted">
            Aucun emplacement associé à votre compte : cette page est réservée aux comptes
            barman/cuisinier rattachés à un bar ou une cuisine.
          </p>
        </Card>
      </div>
    );
  }

  const stock = await getLocationStock(db, session.locationId);
  const totalValue = stock.reduce((sum, l) => sum + l.value, 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Mon stock" />
      <StatCard label="Valeur totale" value={`${totalValue.toLocaleString('fr-FR')} FCFA`} />
      {stock.length === 0 ? (
        <EmptyState icon={PackageSearch} message="Aucun mouvement de stock pour l'instant." />
      ) : (
        <StockList items={stock.map((l) => ({
          productId: l.productId, name: l.name, baseUnit: l.baseUnit,
          qty: l.qty, value: l.value, belowThreshold: l.belowThreshold,
        }))} />
      )}
    </div>
  );
}
