'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { deliverOrder } from '@/lib/orders';
import { formNumber } from '@/lib/forms';
import { totalBase } from '@/lib/units';

export type DeliveryFormState = { error?: string };

export async function deliverOrderAction(_prev: DeliveryFormState, formData: FormData):
  Promise<DeliveryFormState> {
  const session = await requireRole(['magasinier']);
  const orderId = formNumber(formData, 'orderId');
  if (orderId == null) return { error: 'Commande invalide' };

  // Champ de ligne → nombre fini ou null (vide/forgé → null), même contrat que formNumber
  // (cf. src/app/(protected)/commandes/actions.ts). Contrairement à la saisie de commande,
  // ici chaque ligne provient d'un champ caché (une par produit de la commande) : on rejette
  // donc toute valeur manquante ou non finie plutôt que de la traiter silencieusement comme 0.
  const parse = (v: FormDataEntryValue): number | null => {
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const productIds = formData.getAll('lineProduct').map(parse);
  const packs = formData.getAll('linePacks').map(parse);
  const units = formData.getAll('lineUnits').map(parse);
  const packSizes = formData.getAll('linePackSize').map(parse);

  if (productIds.some((v) => v == null)) {
    return { error: 'Ligne de livraison invalide' };
  }
  if (packs.some((v) => v == null) || units.some((v) => v == null)) {
    return { error: 'Quantité livrée invalide sur une ligne' };
  }

  const lines = productIds.map((productId, i) => ({
    productId: productId as number,
    qtyDelivered: totalBase({
      packs: packs[i] as number,
      units: units[i] as number,
      packSize: packSizes[i],
    }),
  }));

  let res: Awaited<ReturnType<typeof deliverOrder>>;
  try {
    res = await deliverOrder(db, { orderId, deliveredBy: session.userId, lines });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/livraisons');
  // redirect() fonctionne en levant une exception : il doit rester HORS du try/catch.
  redirect('/livraisons');
}
