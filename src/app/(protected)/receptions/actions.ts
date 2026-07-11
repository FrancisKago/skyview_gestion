'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { receiveOrder } from '@/lib/orders';
import { formNumber } from '@/lib/forms';

export type ReceptionFormState = { error?: string };

export async function receiveOrderAction(_prev: ReceptionFormState, formData: FormData):
  Promise<ReceptionFormState> {
  const session = await requireRole(['barman', 'cuisinier']);
  // Même garde que commandes/actions.ts : un compte sans emplacement (admin) ne doit pas
  // pouvoir réceptionner via un POST direct — locationId null désactiverait le contrôle
  // d'emplacement de receiveOrder.
  if (!session.locationId) return { error: 'Aucun emplacement associé à votre compte' };
  const orderId = formNumber(formData, 'orderId');
  if (orderId == null) return { error: 'Commande invalide' };

  // Champ de ligne → nombre fini ou null (vide/forgé → null), même contrat que formNumber
  // (cf. src/app/(protected)/livraisons/actions.ts). Chaque ligne provient d'un champ caché
  // (une par produit de la commande) : on rejette donc toute valeur manquante ou non finie
  // plutôt que de la traiter silencieusement comme 0.
  const parse = (v: FormDataEntryValue): number | null => {
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const productIds = formData.getAll('lineProduct').map(parse);
  const qtys = formData.getAll('lineQty').map(parse);

  if (productIds.some((v) => v == null)) {
    return { error: 'Ligne de réception invalide' };
  }
  if (qtys.some((v) => v == null)) {
    return { error: 'Quantité reçue invalide sur une ligne' };
  }
  const ids = productIds as number[];
  const lines = ids.map((productId, i) => ({ productId, qtyReceived: qtys[i] as number }));

  let res: Awaited<ReturnType<typeof receiveOrder>>;
  try {
    res = await receiveOrder(db, {
      orderId, receivedBy: session.userId, locationId: session.locationId, lines,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/receptions');
  revalidatePath('/stock');
  // redirect() fonctionne en levant une exception : il doit rester HORS du try/catch.
  redirect('/stock');
}
