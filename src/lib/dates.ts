// Valide un YYYY-MM-DD réel (rejette '2026-02-31', 'not-a-date', etc.), pas
// seulement la forme de la chaîne : l'aller-retour via Date.UTC détecte les
// débordements de calendrier qu'une simple regex laisserait passer.
// Extrait de src/lib/service-exits.ts (Tâche 16) pour être réutilisé par
// src/lib/inventories.ts (Tâche 18).
export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
