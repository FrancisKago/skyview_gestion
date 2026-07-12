'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { recordAdjustment } from '@/lib/adjustments';
import { formNumber, formValues } from '@/lib/forms';

export type AdjustmentFormState = {
  error?: string;
  success?: boolean;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  values?: Record<string, string>;
  attempt?: number;
};

const FIELDS = ['productId', 'locationId', 'qty', 'reason'] as const;

export async function recordAdjustmentAction(prev: AdjustmentFormState, formData: FormData):
  Promise<AdjustmentFormState> {
  const session = await requireRole(['admin']);
  const fail = (error?: string): AdjustmentFormState =>
    ({ error, values: formValues(formData, FIELDS), attempt: (prev.attempt ?? 0) + 1 });
  const productId = formNumber(formData, 'productId');
  const locationId = formNumber(formData, 'locationId');
  const qty = formNumber(formData, 'qty');
  if (productId == null) return fail('Choisissez un produit');
  if (locationId == null) return fail('Choisissez un emplacement');
  if (qty == null) return fail('La quantité doit être un nombre');
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
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  // Le journal affiché sur cette page inclut tous les mouvements (pas seulement
  // les ajustements) ; /stock et /compta lisent aussi le solde impacté.
  revalidatePath('/admin/ajustements');
  revalidatePath('/stock');
  revalidatePath('/compta');
  // Succès : values/attempt absents → key repart à 0 ; le reset manuel via
  // formRef côté client (souhaité après succès) est conservé.
  return { success: true };
}
