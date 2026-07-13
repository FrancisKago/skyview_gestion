import * as XLSX from 'xlsx';
import type { MovementReportLine } from './movement-report';

export interface MovementExportSection { locationName: string; lines: MovementReportLine[] }

const HEADERS = [
  'Produit', 'Unité', 'Stock initial', 'Réceptions', 'Sorties', 'Ajustements', 'Stock final',
  'Valeur initiale (FCFA)', 'Valeur réceptions (FCFA)', 'Valeur sorties (FCFA)',
  'Valeur ajustements (FCFA)', 'Valeur finale (FCFA)',
];

const nums = (l: MovementReportLine): number[] => [
  l.initial, l.receptions, l.sorties, l.ajustements, l.final,
  l.initialValue, l.receptionsValue, l.sortiesValue, l.ajustementsValue, l.finalValue,
];

// Export du rapport de mouvements (spec durcissement §7). CSV : BOM UTF-8, séparateur ;,
// virgule décimale (conventions templates), colonne Emplacement en tête. xlsx : une
// feuille par emplacement, valeurs numériques natives.
export function buildMovementExport(sections: MovementExportSection[], opts: {
  format: 'csv' | 'xlsx'; from: string; to: string;
}): { buffer: Buffer; filename: string; contentType: string } {
  const base = `mouvements-${opts.from}-${opts.to}`;
  if (opts.format === 'csv') {
    const fr = (n: number) => String(n).replace('.', ',');
    const rows = sections.flatMap((s) => s.lines.map((l) =>
      [s.locationName, l.name, l.baseUnit, ...nums(l).map(fr)].join(';')));
    const content = ['Emplacement;' + HEADERS.join(';'), ...rows].join('\n') + '\n';
    return {
      buffer: Buffer.from('\ufeff' + content, 'utf-8'),
      filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8',
    };
  }
  const wb = XLSX.utils.book_new();
  for (const s of sections) {
    const aoa = [HEADERS, ...s.lines.map((l) => [l.name, l.baseUnit, ...nums(l)])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), s.locationName.slice(0, 31));
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    buffer, filename: `${base}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
