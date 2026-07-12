'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { recordServiceExit } from '@/lib/service-exits';

export type ExitFormState = {
  error?: string;
  success?: boolean;
  warnings?: string[];
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  // Les lignes sont renvoyées telles quelles (brutes), y compris les lignes
  // vides, pour conserver la position de chaque champ.
  values?: { serviceDate: string; lines: Array<{ productId: string; qty: string }> };
  attempt?: number;
};

export async function recordExitAction(prev: ExitFormState, formData: FormData):
  Promise<ExitFormState> {
  const session = await requireRole(['barman', 'cuisinier']);
  const serviceDate = String(formData.get('serviceDate') ?? '').trim();
  const rawQtys = formData.getAll('lineQty');
  const fail = (error?: string): ExitFormState => ({
    error,
    values: {
      serviceDate,
      lines: formData.getAll('lineProduct').map((p, i) => ({
        productId: String(p),
        qty: String(rawQtys[i] ?? ''),
      })),
    },
    attempt: (prev.attempt ?? 0) + 1,
  });
  if (!session.locationId) return fail('Aucun emplacement associé à votre compte');
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
    return fail('Ligne incomplète : chaque ligne doit avoir un produit ET une quantité');
  }
  const lines = rows.filter(
    (r): r is { productId: number; qty: number } => r.productId != null && r.qty != null,
  );
  // Vide (jamais rempli côté client) → undefined plutôt qu'une chaîne vide : recordServiceExit
  // n'active la garde d'idempotence que si un jeton est fourni.
  const clientToken = String(formData.get('clientToken') ?? '').trim() || undefined;
  let res: Awaited<ReturnType<typeof recordServiceExit>>;
  try {
    res = await recordServiceExit(db, {
      locationId: session.locationId,
      serviceDate,
      createdBy: session.userId,
      lines,
      clientToken,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/sorties');
  // Le stock de l'emplacement vient de bouger : la page /stock (Tâche 17) doit refléter
  // les nouvelles quantités dès sa prochaine visite.
  revalidatePath('/stock');
  // Succès : values/attempt absents → key repart à 0 ; le reset manuel via
  // formRef côté client (souhaité après succès) est conservé.
  return { success: true, warnings: res.warnings };
}
