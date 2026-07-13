'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { validateInventory, type InventoryGap } from '@/lib/inventories';

export type InventoryFormState = {
  error?: string;
  gaps?: InventoryGap[];
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  // Les quantités comptées sont indexées par id produit (les lignes du
  // formulaire sont fixes, une par produit en stock).
  values?: { inventoryDate: string; counted: Record<string, string> };
  attempt?: number;
};

export async function validateInventoryAction(
  prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await requireRole(['barman', 'cuisinier']);
  const inventoryDate = String(formData.get('inventoryDate') ?? '').trim();
  const fail = (error?: string): InventoryFormState => {
    const ids = formData.getAll('lineProduct');
    const raw = formData.getAll('lineCounted');
    const counted: Record<string, string> = {};
    ids.forEach((id, i) => {
      const s = String(raw[i] ?? '');
      if (s !== '') counted[String(id)] = s;
    });
    return { error, values: { inventoryDate, counted }, attempt: (prev.attempt ?? 0) + 1 };
  };
  if (!session.locationId) return fail('Aucun emplacement associé à votre compte');

  // Lignes fixes (une par produit en stock) : lineProduct (hidden, toujours rempli)
  // + lineCounted (optionnel). Un lineCounted vide = produit NON compté : on l'ignore
  // silencieusement (ce n'est PAS une ligne incomplète, contrairement à /sorties où
  // produit et quantité sont saisis librement ensemble). Un lineCounted rempli mais
  // non numérique (saisie forgée) est en revanche une erreur explicite.
  const productIds = formData.getAll('lineProduct').map((v) => Number(v));
  const countedRaw = formData.getAll('lineCounted');
  const lines: Array<{ productId: number; qtyCounted: number }> = [];
  for (let i = 0; i < productIds.length; i += 1) {
    const s = String(countedRaw[i] ?? '').trim();
    if (s === '') continue; // non compté : on saute la ligne, pas d'erreur
    const n = Number(s);
    if (!Number.isFinite(n)) {
      return fail('Quantité comptée invalide');
    }
    lines.push({ productId: productIds[i], qtyCounted: n });
  }

  let res: Awaited<ReturnType<typeof validateInventory>>;
  try {
    res = await validateInventory(db, {
      locationId: session.locationId,
      inventoryDate,
      countedBy: session.userId,
      lines,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/inventaire');
  // Le stock de l'emplacement vient d'être ajusté : la page /stock (Tâche 17) doit
  // refléter les nouvelles quantités dès sa prochaine visite.
  revalidatePath('/stock');
  // Succès : le client remplace le formulaire par le récapitulatif des écarts,
  // pas de values/attempt à renvoyer.
  return { gaps: res.gaps };
}
