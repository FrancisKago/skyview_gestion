'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { MAX_UPLOAD_BYTES } from '@/lib/import-table';
import { parseSalesFile } from '@/lib/sales-file';
import { storeSalesImport, matchImportLine } from '@/lib/sales-imports';
import { formNumber } from '@/lib/forms';

export type UploadFormState = { error?: string; summary?: string };

export async function uploadSalesAction(
  _prev: UploadFormState,
  formData: FormData,
): Promise<UploadFormState> {
  const session = await requireRole(['comptable']);
  const file = formData.get('file') as File | null;
  const serviceDate = String(formData.get('serviceDate') ?? '').trim();
  if (!file || !file.size) return { error: 'Choisissez un fichier CSV ou Excel' };
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'Fichier trop volumineux (4 Mo maximum)' };
  const parsed = parseSalesFile(Buffer.from(await file.arrayBuffer()), file.name);
  if (!parsed.ok) return { error: parsed.error };
  let res: Awaited<ReturnType<typeof storeSalesImport>>;
  try {
    res = await storeSalesImport(db, {
      filename: file.name, serviceDate, uploadedBy: session.userId, rows: parsed.rows,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/compta/imports');
  return {
    summary: `Import réussi : ${res.matched} article(s) reconnus, ${res.unmatched} à faire correspondre, ${parsed.skipped} ligne(s) ignorée(s).`,
  };
}

export async function matchLineAction(formData: FormData) {
  await requireRole(['comptable']);
  const lineId = formNumber(formData, 'lineId'); // finite ou null (garde-fou : lineId forgé)
  if (lineId == null) return;
  const cashName = String(formData.get('cashName') ?? '').trim();
  if (!cashName) return;
  let res: Awaited<ReturnType<typeof matchImportLine>>;
  try {
    res = await matchImportLine(db, { lineId, saleArticleCashName: cashName });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : action de formulaire simple
    // (sans useActionState), pas d'affichage d'erreur possible ; on abandonne
    // silencieusement plutôt que de laisser fuiter une erreur DB brute.
    return;
  }
  if (!res.ok) return;
  revalidatePath('/compta/imports');
}
