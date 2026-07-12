'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { products } from '@/db/schema';
import { requireRole } from '@/lib/session';
import { deliverOrder } from '@/lib/orders';
import { formNumber } from '@/lib/forms';
import { totalBase } from '@/lib/units';

export type DeliveryFormState = {
  error?: string;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  // Les saisies (casiers + unités) sont indexées par id produit (les lignes du
  // formulaire sont fixes, une par produit de la commande).
  values?: { lines: Record<string, { packs: string; units: string }> };
  attempt?: number;
};

export async function deliverOrderAction(prev: DeliveryFormState, formData: FormData):
  Promise<DeliveryFormState> {
  const session = await requireRole(['magasinier']);
  const fail = (error?: string): DeliveryFormState => {
    const idsRaw = formData.getAll('lineProduct');
    const packsRaw = formData.getAll('linePacks');
    const unitsRaw = formData.getAll('lineUnits');
    const lines: Record<string, { packs: string; units: string }> = {};
    idsRaw.forEach((id, i) => {
      lines[String(id)] = { packs: String(packsRaw[i] ?? ''), units: String(unitsRaw[i] ?? '') };
    });
    return { error, values: { lines }, attempt: (prev.attempt ?? 0) + 1 };
  };
  const orderId = formNumber(formData, 'orderId');
  if (orderId == null) return fail('Commande invalide');

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

  if (productIds.some((v) => v == null)) {
    return fail('Ligne de livraison invalide');
  }
  if (packs.some((v) => v == null) || units.some((v) => v == null)) {
    return fail('Quantité livrée invalide sur une ligne');
  }
  const ids = productIds as number[];

  let res: Awaited<ReturnType<typeof deliverOrder>>;
  try {
    // packSize lu en base et non depuis un champ caché : un client forgé ne doit pas
    // pouvoir gonfler la conversion casier → bouteilles.
    const prods = ids.length
      ? await db.select({ id: products.id, packSize: products.packSize }).from(products)
          .where(inArray(products.id, ids))
      : [];
    const packSizeById = new Map(
      prods.map((p) => [p.id, p.packSize ? Number(p.packSize) : null]),
    );
    const lines = ids.map((productId, i) => ({
      productId,
      qtyDelivered: totalBase({
        packs: packs[i] as number,
        units: units[i] as number,
        packSize: packSizeById.get(productId) ?? null,
      }),
    }));
    res = await deliverOrder(db, { orderId, deliveredBy: session.userId, lines });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/livraisons');
  // redirect() fonctionne en levant une exception : il doit rester HORS du try/catch.
  redirect('/livraisons');
}
