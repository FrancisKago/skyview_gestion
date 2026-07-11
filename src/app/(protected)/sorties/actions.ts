'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { recordServiceExit } from '@/lib/service-exits';

export type ExitFormState = { error?: string; success?: boolean; warnings?: string[] };

export async function recordExitAction(_prev: ExitFormState, formData: FormData):
  Promise<ExitFormState> {
  const session = await requireRole(['barman', 'cuisinier']);
  if (!session.locationId) return { error: 'Aucun emplacement associé à votre compte' };
  const serviceDate = String(formData.get('serviceDate') ?? '').trim();
  // Champ de ligne → nombre fini ou null (vide/forgé → null), même contrat que
  // src/app/(protected)/commandes/actions.ts.
  const parse = (v: FormDataEntryValue): number | null => {
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const productIds = formData.getAll('lineProduct').map(parse);
  const qtys = formData.getAll('lineQty').map(parse);
  const rows = productIds.map((productId, i) => ({ productId, qty: qtys[i] ?? null }));
  // Ligne partiellement remplie (produit sans quantité ou l'inverse) : erreur
  // explicite plutôt qu'un abandon silencieux de la ligne. Les lignes
  // entièrement vides restent ignorées (emplacements de formulaire inutilisés).
  if (rows.some((r) => (r.productId == null) !== (r.qty == null))) {
    return { error: 'Ligne incomplète : chaque ligne doit avoir un produit ET une quantité' };
  }
  const lines = rows.filter(
    (r): r is { productId: number; qty: number } => r.productId != null && r.qty != null,
  );
  let res: Awaited<ReturnType<typeof recordServiceExit>>;
  try {
    res = await recordServiceExit(db, {
      locationId: session.locationId,
      serviceDate,
      createdBy: session.userId,
      lines,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/sorties');
  return { success: true, warnings: res.warnings };
}
