import * as XLSX from 'xlsx';

export const PRODUCT_HEADERS = [
  'Nom', 'Catégorie', 'Unité de base', 'Conditionnement',
  'Taille conditionnement', "Prix d'achat (FCFA)", "Seuil d'alerte",
] as const;

export const ARTICLE_HEADERS = ['Article caisse', 'Emplacement', 'Produit', 'Quantité'] as const;

export const INVENTORY_HEADERS = ['Produit', 'Quantité comptée'] as const;

const EXAMPLES: Record<'produits' | 'articles' | 'inventaire', string[][]> = {
  produits: [
    ['Castel 65cl', 'Bières', 'bouteille', 'casier', '12', '650', '24'],
    ['Poulet', 'Vivres', 'kg', '', '', '3500', '5'],
    ['Règles : une ligne par produit. Conditionnement et Taille vont ensemble (les deux ou aucun). Prix obligatoire. Virgules décimales acceptées.'],
  ],
  articles: [
    ['Poulet DG', 'Cuisine', 'Poulet', '0,4'],
    ['Poulet DG', 'Cuisine', 'Plantain', '0,2'],
    ['Castel 65cl', 'Bar', 'Castel 65cl', '1'],
    ['Règles : une ligne par ingrédient (l’article est répété). Emplacement : Bar ou Cuisine. Les produits doivent déjà exister.'],
  ],
  inventaire: [
    ['Castel 65cl', '18'],
    ['Poulet', '2,5'],
    ['Règles : une ligne par produit compté. Les produits absents du fichier ne sont PAS comptés et gardent leur stock. Virgules décimales acceptées.'],
  ],
};

export function buildTemplate(type: 'produits' | 'articles' | 'inventaire', format: 'xlsx' | 'csv'): {
  buffer: Buffer; filename: string; contentType: string;
} {
  const headers = type === 'produits' ? [...PRODUCT_HEADERS]
    : type === 'articles' ? [...ARTICLE_HEADERS] : [...INVENTORY_HEADERS];
  if (format === 'csv') {
    // BOM pour qu'Excel FR ouvre l'UTF-8 correctement ; séparateur ;
    const buffer = Buffer.from('\ufeff' + headers.join(';') + '\n', 'utf-8');
    return { buffer, filename: `template-${type}.csv`, contentType: 'text/csv; charset=utf-8' };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers]), 'À remplir');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...EXAMPLES[type]]), 'Exemples');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    buffer, filename: `template-${type}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
