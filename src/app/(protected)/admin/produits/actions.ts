'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber, formValues } from '@/lib/forms';
import { saveProduct } from '@/lib/products';

export type ProductFormState = {
  error?: string;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  values?: Record<string, string>;
  attempt?: number;
};

const FIELDS = ['name', 'category', 'baseUnit', 'packName', 'packSize', 'purchasePrice', 'alertThreshold'] as const;

export async function saveProductAction(prev: ProductFormState, formData: FormData):
  Promise<ProductFormState> {
  await requireRole(['admin']);
  const fail = (error?: string): ProductFormState =>
    ({ error, values: formValues(formData, FIELDS), attempt: (prev.attempt ?? 0) + 1 });
  const num = (k: string) => formNumber(formData, k);
  let res: Awaited<ReturnType<typeof saveProduct>>;
  try {
    res = await saveProduct(db, {
      id: num('id') ?? undefined,
      name: String(formData.get('name') ?? ''),
      category: String(formData.get('category') ?? ''),
      baseUnit: String(formData.get('baseUnit') ?? ''),
      packName: String(formData.get('packName') ?? '') || null,
      packSize: num('packSize'),
      purchasePrice: num('purchasePrice') ?? 0,
      alertThreshold: num('alertThreshold'),
      active: formData.get('active') !== 'off',
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/admin/produits');
  // Succès : état vide → key repart à 0, les champs remontent vides (le reset
  // automatique après soumission est le comportement souhaité en création).
  return {};
}
