import * as XLSX from 'xlsx';
import { normalizeText } from './text';

// Plafond d'upload des imports (la plateforme limite le corps de requête à ~4,5 Mo ;
// un catalogue réel fait quelques dizaines de Ko). Spec durcissement §3.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export interface ParsedRow { line: number; cells: Record<string, string> }
export interface TableParseResult { ok: boolean; rows: ParsedRow[]; error?: string }

// '1,5' -> 1.5 ; '' / non numérique -> null.
export function toNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Parse la PREMIÈRE feuille d'un CSV/XLSX en lignes objets, clés = en-têtes
// canoniques fournis (reconnus par nom normalisé). Toutes les colonnes attendues
// doivent être présentes, aucune colonne inconnue tolérée (spec imports §8.1).
// raw:false + codepage 65001 : mêmes précautions que sales-file.ts (virgules
// décimales préservées en texte, accents corrects).
export function parseTable(buffer: Buffer, filename: string, expectedHeaders: string[]): TableParseResult {
  let rows: string[][];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('feuille vide');
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as string[][];
  } catch {
    return { ok: false, rows: [], error: `Fichier illisible (${filename}) : format attendu CSV ou Excel` };
  }
  if (!rows.length) return { ok: false, rows: [], error: 'Fichier vide' };

  // En-têtes durcis (spec durcissement §2) : les cellules vides en FIN de ligne sont
  // tolérées (artefact d'export Excel), mais une cellule vide AU MILIEU décalerait
  // silencieusement les colonnes de données -> rejet explicite. Doublons rejetés
  // (le second écraserait le premier dans `cells`).
  const headerRow = rows[0].map((h) => String(h ?? '').trim());
  while (headerRow.length && headerRow[headerRow.length - 1] === '') headerRow.pop();
  const byNormalized = new Map(expectedHeaders.map((h) => [normalizeText(h), h]));
  const mapping: string[] = []; // index de colonne -> en-tête canonique
  const seen = new Set<string>();
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i];
    if (h === '') {
      return { ok: false, rows: [], error: `Colonne d'en-tête vide (position ${i + 1})` };
    }
    const canonical = byNormalized.get(normalizeText(h));
    if (!canonical) return { ok: false, rows: [], error: `Colonne inconnue : « ${h} »` };
    if (seen.has(canonical)) return { ok: false, rows: [], error: `Colonne en double : « ${h} »` };
    seen.add(canonical);
    mapping.push(canonical);
  }
  const missing = expectedHeaders.filter((h) => !mapping.includes(h));
  if (missing.length) {
    return { ok: false, rows: [], error: `Colonne(s) manquante(s) : ${missing.join(', ')}` };
  }

  const parsed: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i];
    const cells: Record<string, string> = {};
    let hasContent = false;
    mapping.forEach((canonical, col) => {
      const v = String(raw[col] ?? '').trim();
      cells[canonical] = v;
      if (v) hasContent = true;
    });
    if (!hasContent) continue; // ligne vide sautée silencieusement
    parsed.push({ line: i + 1, cells });
  }
  if (!parsed.length) return { ok: false, rows: [], error: 'Aucune ligne de données exploitable' };
  return { ok: true, rows: parsed };
}
