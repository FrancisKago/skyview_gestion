'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber } from '@/lib/forms';
import { saveSaleArticle } from '@/lib/sale-articles';

export type ArticleFormState = { error?: string };

export async function saveSaleArticleAction(_prev: ArticleFormState, formData: FormData):
  Promise<ArticleFormState> {
  await requireRole(['admin']);
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
    return { error: 'Ligne incomplète : chaque ingrédient doit avoir un produit ET une quantité' };
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
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/articles');
  // Après une mise à jour, retirer ?edit de l'URL. redirect() lance
  // NEXT_REDIRECT : il doit rester HORS du try/catch ci-dessus.
  if (id != null) redirect('/admin/articles');
  return {};
}
