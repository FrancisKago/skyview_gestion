'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { validateInventory, type InventoryGap } from '@/lib/inventories';

export type InventoryFormState = { error?: string; gaps?: InventoryGap[] };

export async function validateInventoryAction(
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await requireRole(['barman', 'cuisinier']);
  if (!session.locationId) return { error: 'Aucun emplacement associé à votre compte' };
  const inventoryDate = String(formData.get('inventoryDate') ?? '').trim();

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
      return { error: 'Quantité comptée invalide' };
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
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/inventaire');
  // Le stock de l'emplacement vient d'être ajusté : la page /stock (Tâche 17) doit
  // refléter les nouvelles quantités dès sa prochaine visite.
  revalidatePath('/stock');
  return { gaps: res.gaps };
}
