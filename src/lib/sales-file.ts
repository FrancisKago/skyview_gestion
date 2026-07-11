import * as XLSX from 'xlsx';
import { round3 } from './units';

export interface ParsedSales {
  ok: boolean;
  rows: Array<{ articleName: string; qty: number }>;
  skipped: number; // lignes ignorées (sans nom ou sans quantité numérique)
  error?: string;
}

// Lit la 1re feuille du fichier (CSV ou Excel) ; attend 2 colonnes : nom d'article
// (colonne A), quantité vendue (colonne B). Toute colonne supplémentaire est ignorée.
// La 1re ligne est traitée comme en-tête si sa 2e colonne n'est pas numérique.
//
// Séparateur CSV : auto-détecté par SheetJS, donc aussi bien ';' (export caisse FR
// standard) que ',' sont acceptés sans configuration. Les quantités à virgule
// décimale ('1,5') sont supportées : on lit le texte formaté des cellules
// (raw: false) plutôt que leur valeur numérique déjà interprétée par SheetJS, qui
// interprète sinon la virgule comme séparateur de milliers et corrompt la valeur
// (ex. '1,5' => 15). Encodage attendu : UTF-8.
export function parseSalesFile(buffer: Buffer, filename: string): ParsedSales {
  let rows: Array<Array<string>>;
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('feuille vide');
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as Array<Array<string>>;
  } catch {
    return { ok: false, rows: [], skipped: 0, error: `Fichier illisible (${filename}) : format attendu CSV ou Excel` };
  }
  if (!rows.length) return { ok: false, rows: [], skipped: 0, error: 'Fichier vide' };

  const firstQty = rows[0]?.[1];
  const start = firstQty === undefined || String(firstQty).trim() === '' || isNaN(Number(String(firstQty).replace(',', '.'))) ? 1 : 0;
  const acc = new Map<string, number>();
  let skipped = 0;
  for (const row of rows.slice(start)) {
    const name = String(row[0] ?? '').trim();
    const rawQty = String(row[1] ?? '').trim();
    const qty = Number(rawQty.replace(',', '.'));
    if (!name && !rawQty) continue; // ligne totalement vide : ignorée silencieusement
    if (!name || isNaN(qty) || qty <= 0) { skipped++; continue; }
    acc.set(name, round3((acc.get(name) ?? 0) + qty));
  }
  if (!acc.size) return { ok: false, rows: [], skipped, error: 'Aucune ligne de vente exploitable' };
  return {
    ok: true,
    rows: Array.from(acc, ([articleName, qty]) => ({ articleName, qty })),
    skipped,
  };
}
