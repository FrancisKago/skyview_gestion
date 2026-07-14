'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber, formValues } from '@/lib/forms';
import { saveProduct, deleteProduct, archiveProduct } from '@/lib/products';

export type ProductFormState = {
  error?: string;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  values?: Record<string, string>;
  attempt?: number;
};

// `active` (case à cocher) n'est présent dans FormData que si cochée ('on') :
// son absence dans `values` signifie « décochée » pour le client.
const FIELDS = ['name', 'category', 'baseUnit', 'packName', 'packSize', 'purchasePrice', 'alertThreshold', 'active'] as const;

export async function saveProductAction(prev: ProductFormState, formData: FormData):
  Promise<ProductFormState> {
  await requireRole(['admin']);
  const fail = (error?: string): ProductFormState =>
    ({ error, values: formValues(formData, FIELDS), attempt: (prev.attempt ?? 0) + 1 });
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
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/admin/produits');
  // Après une mise à jour, retirer ?edit de l'URL. redirect() lance
  // NEXT_REDIRECT : il doit rester HORS du try/catch ci-dessus.
  if (id != null) redirect('/admin/produits');
  // Succès en création : état vide → key repart à 0, les champs remontent
  // vides (le reset automatique après soumission est le comportement souhaité).
  return {};
}

export type ProductRowState = { error?: string };

export async function deleteProductAction(_prev: ProductRowState, formData: FormData):
  Promise<ProductRowState> {
  await requireRole(['admin']);
  const id = formNumber(formData, 'id');
  if (id == null) return { error: 'Produit invalide' };
  let res: Awaited<ReturnType<typeof deleteProduct>>;
  try {
    res = await deleteProduct(db, id);
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/produits');
  return {};
}

export async function archiveProductAction(_prev: ProductRowState, formData: FormData):
  Promise<ProductRowState> {
  await requireRole(['admin']);
  const id = formNumber(formData, 'id');
  if (id == null) return { error: 'Produit invalide' };
  const archived = formData.get('archived') === '1';
  let res: Awaited<ReturnType<typeof archiveProduct>>;
  try {
    res = await archiveProduct(db, id, archived);
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/produits');
  return {};
}
