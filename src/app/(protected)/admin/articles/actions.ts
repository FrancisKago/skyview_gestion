'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber } from '@/lib/forms';
import { saveSaleArticle } from '@/lib/sale-articles';

export type ArticleFormState = {
  error?: string;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  // Les lignes de fiche technique sont renvoyées telles quelles (brutes),
  // y compris les lignes vides, pour conserver la position de chaque champ.
  values?: {
    cashName: string;
    locationId: string;
    lines: Array<{ productId: string; qty: string }>;
  };
  attempt?: number;
};

export async function saveSaleArticleAction(prev: ArticleFormState, formData: FormData):
  Promise<ArticleFormState> {
  await requireRole(['admin']);
  const rawQtys = formData.getAll('lineQty');
  const fail = (error?: string): ArticleFormState => ({
    error,
    values: {
      cashName: String(formData.get('cashName') ?? ''),
      locationId: String(formData.get('locationId') ?? ''),
      lines: formData.getAll('lineProduct').map((p, i) => ({
        productId: String(p),
        qty: String(rawQtys[i] ?? ''),
      })),
    },
    attempt: (prev.attempt ?? 0) + 1,
  });
  const num = (k: string) => formNumber(formData, k);
  // Champ de ligne → nombre fini ou null (vide/forgé → null), même contrat que formNumber.
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
    return fail('Ligne incomplète : chaque ingrédient doit avoir un produit ET une quantité');
  }
  const lines = rows.filter(
    (r): r is { productId: number; qty: number } => r.productId != null && r.qty != null,
  );
  const id = num('id') ?? undefined;
  let res: Awaited<ReturnType<typeof saveSaleArticle>>;
  try {
    res = await saveSaleArticle(db, {
      id,
      cashName: String(formData.get('cashName') ?? ''),
      locationId: num('locationId') ?? 0,
      lines,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/admin/articles');
  // Après une mise à jour, retirer ?edit de l'URL. redirect() lance
  // NEXT_REDIRECT : il doit rester HORS du try/catch ci-dessus.
  if (id != null) redirect('/admin/articles');
  // Succès : état vide → key repart à 0, les champs remontent vides (le reset
  // automatique après soumission est le comportement souhaité en création).
  return {};
}
