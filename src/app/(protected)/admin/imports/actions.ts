'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { parseTable } from '@/lib/import-table';
import { PRODUCT_HEADERS, ARTICLE_HEADERS } from '@/lib/templates';
import { importProducts, type ImportReport } from '@/lib/import-products';
import { importArticles } from '@/lib/import-articles';

export type ImportFormState = { error?: string; report?: ImportReport };

async function runImport(
  formData: FormData,
  headers: readonly string[],
  run: (rows: Parameters<typeof importProducts>[1], update: boolean) => Promise<ImportReport>,
  paths: string[],
): Promise<ImportFormState> {
  await requireRole(['admin']);
  const file = formData.get('file') as File | null;
  if (!file || !file.size) return { error: 'Choisissez un fichier CSV ou Excel' };
  const update = formData.get('update') === 'on';
  const parsed = parseTable(Buffer.from(await file.arrayBuffer()), file.name, [...headers]);
  if (!parsed.ok) return { error: parsed.error };
  try {
    const report = await run(parsed.rows, update);
    for (const p of paths) revalidatePath(p);
    return { report };
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
}

export async function importProductsAction(_prev: ImportFormState, formData: FormData) {
  return runImport(formData, PRODUCT_HEADERS,
    (rows, update) => importProducts(db, rows, { update }),
    ['/admin/imports', '/admin/produits']);
}

export async function importArticlesAction(_prev: ImportFormState, formData: FormData) {
  return runImport(formData, ARTICLE_HEADERS,
    (rows, update) => importArticles(db, rows, { update }),
    ['/admin/imports', '/admin/articles']);
}
