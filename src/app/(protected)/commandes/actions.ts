'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { createOrder } from '@/lib/orders';

export type OrderFormState = {
  error?: string;
  success?: boolean;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  // Les lignes sont renvoyées telles quelles (brutes), y compris les lignes
  // vides, pour conserver la position de chaque champ.
  values?: { lines: Array<{ productId: string; qty: string }> };
  attempt?: number;
};

export async function createOrderAction(prev: OrderFormState, formData: FormData):
  Promise<OrderFormState> {
  const session = await requireRole(['barman', 'cuisinier']);
  const rawQtys = formData.getAll('lineQty');
  const fail = (error?: string): OrderFormState => ({
    error,
    values: {
      lines: formData.getAll('lineProduct').map((p, i) => ({
        productId: String(p),
        qty: String(rawQtys[i] ?? ''),
      })),
    },
    attempt: (prev.attempt ?? 0) + 1,
  });
  if (!session.locationId) return fail('Aucun emplacement associé à votre compte');
  // Champ de ligne → nombre fini ou null (vide/forgé → null), même contrat que formNumber
  // (cf. src/app/(protected)/admin/articles/actions.ts).
  const parse = (v: FormDataEntryValue): number | null => {
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const productIds = formData.getAll('lineProduct').map(parse);
  const qtys = formData.getAll('lineQty').map(parse);
  const rows = productIds.map((productId, i) => ({ productId, qtyRequested: qtys[i] ?? null }));
  // Ligne partiellement remplie (produit sans quantité ou l'inverse) : erreur
  // explicite plutôt qu'un abandon silencieux de la ligne. Les lignes
  // entièrement vides restent ignorées (emplacements de formulaire inutilisés).
  if (rows.some((r) => (r.productId == null) !== (r.qtyRequested == null))) {
    return fail('Ligne incomplète : chaque ligne doit avoir un produit ET une quantité');
  }
  const lines = rows.filter(
    (r): r is { productId: number; qtyRequested: number } => r.productId != null && r.qtyRequested != null,
  );
  let res: Awaited<ReturnType<typeof createOrder>>;
  try {
    res = await createOrder(db, {
      locationId: session.locationId,
      createdBy: session.userId,
      lines,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/commandes');
  // Succès : values/attempt absents → key repart à 0 ; le reset manuel via
  // formRef côté client (souhaité après succès) est conservé.
  return { success: true };
}
