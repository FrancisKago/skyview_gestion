// Lit un champ numérique de FormData : null si vide, null si non numérique.
export function formNumber(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Extrait les valeurs texte soumises pour les renvoyer dans l'état d'action en
// cas d'erreur : React 19 réinitialise les champs non contrôlés après CHAQUE
// soumission de form action (même en échec), le client les réinjecte donc en
// defaultValue avec un remontage forcé (key = compteur de tentatives).
// Les clés absentes ou non-texte (fichiers) sont simplement omises.
export function formValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const raw = formData.get(key);
    if (typeof raw === 'string') out[key] = raw;
  }
  return out;
}
