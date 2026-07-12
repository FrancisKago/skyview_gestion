import { requireRole } from '@/lib/session';
import { db } from '@/db';
import { getLocationStock } from '@/lib/stock';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { InventoryForm } from './inventory-form';

export const dynamic = 'force-dynamic';

export default async function InventairePage() {
  const session = await requireRole(['barman', 'cuisinier']);

  // Garde admin locationId-null AVANT getLocationStock (cf. src/app/(protected)/stock/page.tsx) :
  // un admin passe le contrôle de rôle mais n'a pas d'emplacement, getLocationStock(null)
  // n'a pas de sens métier.
  if (!session.locationId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Inventaire hebdomadaire" />
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
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <PageHeader title="Inventaire hebdomadaire"
        subtitle="Comptez physiquement chaque produit. Laissez vide un produit non compté." />
      <InventoryForm today={today} stock={stock.map((l) => ({
        productId: l.productId, name: l.name, baseUnit: l.baseUnit, qtyTheoretical: l.qty,
      }))} />
    </div>
  );
}
