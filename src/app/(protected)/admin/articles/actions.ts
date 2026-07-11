'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber } from '@/lib/forms';
import { saveSaleArticle } from '@/lib/sale-articles';

export type ArticleFormState = { error?: string };

export async function saveSaleArticleAction(_prev: ArticleFormState, formData: FormData):
  Promise<ArticleFormState> {
  await requireRole(['admin']);
  const num = (k: string) => formNumber(formData, k);
  // On ne garde que les lignes où productId ET qty sont des nombres finis
  // renseignés (Number.isFinite écarte NaN/Infinity issus d'un champ vide ou forgé).
  const productIds = formData.getAll('lineProduct').map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });
  const qtys = formData.getAll('lineQty').map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });
  const lines = productIds
    .map((productId, i) => ({ productId, qty: qtys[i] }))
    .filter((l): l is { productId: number; qty: number } => !!l.productId && !!l.qty);
  let res: Awaited<ReturnType<typeof saveSaleArticle>>;
  try {
    res = await saveSaleArticle(db, {
      id: num('id') ?? undefined,
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
  return {};
}
