// Lit un champ numérique de FormData : null si vide, null si non numérique.
export function formNumber(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
