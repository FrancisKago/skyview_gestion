'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { recordAdjustment } from '@/lib/adjustments';
import { formNumber } from '@/lib/forms';

export type AdjustmentFormState = { error?: string; success?: boolean };

export async function recordAdjustmentAction(_prev: AdjustmentFormState, formData: FormData):
  Promise<AdjustmentFormState> {
  const session = await requireRole(['admin']);
  const productId = formNumber(formData, 'productId');
  const locationId = formNumber(formData, 'locationId');
  const qty = formNumber(formData, 'qty');
  if (productId == null) return { error: 'Choisissez un produit' };
  if (locationId == null) return { error: 'Choisissez un emplacement' };
  if (qty == null) return { error: 'La quantité doit être un nombre' };
  let res: Awaited<ReturnType<typeof recordAdjustment>>;
  try {
    res = await recordAdjustment(db, {
      productId, locationId, qty,
      reason: String(formData.get('reason') ?? ''),
      userId: session.userId,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  // Le journal affiché sur cette page inclut tous les mouvements (pas seulement
  // les ajustements) ; /stock et /compta lisent aussi le solde impacté.
  revalidatePath('/admin/ajustements');
  revalidatePath('/stock');
  revalidatePath('/compta');
  return { success: true };
}
