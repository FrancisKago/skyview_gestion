import { normalizeText } from './text';

export interface ComboOption { id: number; label: string; sublabel?: string; group?: string }

// Suggestions du combobox : requête vide -> tête de liste (le parent a mis les
// fréquents en premier), sinon filtrage « contient » insensible casse/accents.
export function filterComboOptions(options: ComboOption[], query: string, max = 8): ComboOption[] {
  const q = normalizeText(query);
  if (!q) return options.slice(0, max);
  return options.filter((o) => normalizeText(o.label).includes(q)).slice(0, max);
}

// Résolution exacte au blur : « castel 65cl » tapé égale « Castel 65cl ».
export function resolveExact(options: ComboOption[], text: string): ComboOption | null {
  const t = normalizeText(text);
  if (!t) return null;
  return options.find((o) => normalizeText(o.label) === t) ?? null;
}
