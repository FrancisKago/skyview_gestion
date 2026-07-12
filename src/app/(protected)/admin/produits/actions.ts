'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

// 'active' : case à cocher, présente ('on') seulement si cochée — son absence
// dans values signifie donc « décochée » lors de la soumission en erreur.
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
  // Succès : état vide → key repart à 0, les champs remontent vides (le reset
  // automatique après soumission est le comportement souhaité en création).
  return {};
}
