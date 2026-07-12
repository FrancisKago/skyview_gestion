'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { receiveOrder } from '@/lib/orders';
import { formNumber } from '@/lib/forms';

export type ReceptionFormState = {
  error?: string;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  // Les quantités reçues sont indexées par id produit (les lignes du
  // formulaire sont fixes, une par produit de la commande).
  values?: { qty: Record<string, string> };
  attempt?: number;
};

export async function receiveOrderAction(prev: ReceptionFormState, formData: FormData):
  Promise<ReceptionFormState> {
  const session = await requireRole(['barman', 'cuisinier']);
  const fail = (error?: string): ReceptionFormState => {
    const ids = formData.getAll('lineProduct');
    const raw = formData.getAll('lineQty');
    const qty: Record<string, string> = {};
    ids.forEach((id, i) => { qty[String(id)] = String(raw[i] ?? ''); });
    return { error, values: { qty }, attempt: (prev.attempt ?? 0) + 1 };
  };
  // Même garde que commandes/actions.ts : un compte sans emplacement (admin) ne doit pas
  // pouvoir réceptionner via un POST direct — locationId null désactiverait le contrôle
  // d'emplacement de receiveOrder.
  if (!session.locationId) return fail('Aucun emplacement associé à votre compte');
  const orderId = formNumber(formData, 'orderId');
  if (orderId == null) return fail('Commande invalide');

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
    return fail('Ligne de réception invalide');
  }
  if (qtys.some((v) => v == null)) {
    return fail('Quantité reçue invalide sur une ligne');
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
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/receptions');
  revalidatePath('/stock');
  // redirect() fonctionne en levant une exception : il doit rester HORS du try/catch.
  redirect('/stock');
}
