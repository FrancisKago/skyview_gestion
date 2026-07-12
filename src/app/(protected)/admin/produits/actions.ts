'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber } from '@/lib/forms';
import { saveProduct } from '@/lib/products';

export type ProductFormState = { error?: string };

export async function saveProductAction(_prev: ProductFormState, formData: FormData):
  Promise<ProductFormState> {
  await requireRole(['admin']);
  const num = (k: string) => formNumber(formData, k);
  const id = num('id') ?? undefined;
  let res: Awaited<ReturnType<typeof saveProduct>>;
  try {
    res = await saveProduct(db, {
      id,
      name: String(formData.get('name') ?? ''),
      category: String(formData.get('category') ?? ''),
      baseUnit: String(formData.get('baseUnit') ?? ''),
      packName: String(formData.get('packName') ?? '') || null,
      packSize: num('packSize'),
      purchasePrice: num('purchasePrice') ?? 0,
      alertThreshold: num('alertThreshold'),
      active: formData.get('active') === 'on',
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/produits');
  // Après une mise à jour, retirer ?edit de l'URL. redirect() lance
  // NEXT_REDIRECT : il doit rester HORS du try/catch ci-dessus.
  if (id != null) redirect('/admin/produits');
  return {};
}
