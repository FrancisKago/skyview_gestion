// Valide un YYYY-MM-DD réel (rejette '2026-02-31', 'not-a-date', etc.), pas
// seulement la forme de la chaîne : l'aller-retour via Date.UTC détecte les
// débordements de calendrier qu'une simple regex laisserait passer.
// Extrait de src/lib/service-exits.ts (Tâche 16) pour être réutilisé par
// src/lib/inventories.ts (Tâche 18).
// Formate une Date en YYYY-MM-DD dans le fuseau LOCAL (pas toISOString, qui
// passe par UTC et peut changer de jour). Sert aux défauts de période des
// pages Mouvements, export et Imports.
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
