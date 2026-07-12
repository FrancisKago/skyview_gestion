import { eq } from 'drizzle-orm';
import { stockMovements, products, locations } from '@/db/schema';
import type { AnyDb } from '@/db';

export interface RecordAdjustmentInput {
  productId: number;
  locationId: number;
  qty: number;
  reason: string;
  userId: number;
}

// Ajustement admin : INSERT-only, jamais de correction du mouvement en place
// (le journal fait foi — cf. commentaire sur stockMovements dans schema.ts).
// Motif obligatoire (traçabilité) ; magasin exclu (stock magasin non suivi,
// cf. la page ajustements qui ne propose que bar/cuisine).
export async function recordAdjustment(db: AnyDb, input: RecordAdjustmentInput):
  Promise<{ ok: boolean; error?: string }> {
  const reason = input.reason?.trim() ?? '';
  if (!reason) return { ok: false, error: 'Le motif est obligatoire' };
  if (!Number.isFinite(input.qty)) return { ok: false, error: 'La quantité doit être un nombre' };
  if (!input.qty) return { ok: false, error: 'La quantité ne peut pas être nulle' };

  const [product] = await db.select({ id: products.id }).from(products)
    .where(eq(products.id, input.productId));
  if (!product) return { ok: false, error: 'Produit inconnu' };

  const [location] = await db.select({ id: locations.id, type: locations.type }).from(locations)
    .where(eq(locations.id, input.locationId));
  if (!location || location.type === 'magasin') {
    return { ok: false, error: 'Emplacement invalide' };
  }

  await db.insert(stockMovements).values({
    productId: input.productId, locationId: input.locationId,
    type: 'ajustement_admin', qty: String(input.qty),
    reason, userId: input.userId,
  });
  return { ok: true };
}
