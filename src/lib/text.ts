// Normalisation pour la recherche : minuscules, accents retirés, bornes nettoyées.
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  return normalizeText(text).includes(q);
}
