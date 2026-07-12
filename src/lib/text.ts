// Normalisation pour la recherche : minuscules, accents retirés, bornes nettoyées.
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  return normalizeText(text).includes(q);
}

// Distance de Levenshtein classique (itérative, deux rangées).
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

// Suggestion « vouliez-vous … ? » : candidat le plus proche à distance ≤ 2
// (noms normalisés), null sinon. Spec imports §9.
export function suggestClosest(name: string, candidates: string[]): string | null {
  const target = normalizeText(name);
  let best: string | null = null;
  let bestDist = 3;
  for (const c of candidates) {
    const d = levenshtein(target, normalizeText(c));
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= 2 ? best : null;
}
