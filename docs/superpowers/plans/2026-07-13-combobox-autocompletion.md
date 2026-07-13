# Plan d'implémentation — Autocomplétion des champs produit/article (Combobox)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer tous les `<select>` de produits/articles (popups natifs inutilisables à 300+ entrées sur téléphone) par un champ de saisie avec autocomplétion (combobox maison), sans changer une seule action serveur.

**Architecture:** Une lib pure `combo-filter.ts` (filtrage + résolution exacte, TDD) + un composant client `Combobox` (champ texte visible + `<input hidden>` portant l'id — le contrat FormData est inchangé) + intégration chirurgicale dans 6 écrans. Vérification navigateur obligatoire en fin de phase.

**Tech Stack:** Existant uniquement — Next 16, React 19, Vitest, tokens du thème lounge.

**Spec :** `docs/superpowers/specs/2026-07-13-combobox-autocompletion-design.md`

---

## Structure des fichiers

```
src/lib/combo-filter.ts                    # NOUVEAU : ComboOption, filterComboOptions, resolveExact
src/components/ui/combobox.tsx             # NOUVEAU : composant client
src/app/(protected)/commandes/order-form.tsx     # MODIFIÉ : Combobox par ligne, SearchBox retirée
src/app/(protected)/sorties/exit-form.tsx        # MODIFIÉ : idem
src/app/(protected)/admin/articles/article-form.tsx   # MODIFIÉ : lignes d'ingrédients
src/app/(protected)/admin/ajustements/adjustment-form.tsx  # MODIFIÉ : champ produit
src/app/(protected)/compta/imports/match-form.tsx      # MODIFIÉ : cashName (valueAs="label")
src/app/(protected)/compta/mouvements/page.tsx         # MODIFIÉ : filtres produit/article
tests/unit/combo-filter.test.ts            # NOUVEAU : 5 tests
README.md                                  # MODIFIÉ (T6)
```

**Conventions :** branche `feature/combobox-autocompletion` (créée, spec 74d6382) ; sanity départ **173 tests / 32 fichiers** ; AUCUNE action serveur ni lib métier modifiée ; aucun test existant modifié ; `npm run lint` doit rester à 0/0.

---

### Task 1: combo-filter (TDD)

**Files:**
- Create: `src/lib/combo-filter.ts`
- Test: `tests/unit/combo-filter.test.ts`

- [ ] **Step 1: Tests qui échouent** — créer `tests/unit/combo-filter.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { filterComboOptions, resolveExact, type ComboOption } from '@/lib/combo-filter';

const opts: ComboOption[] = [
  { id: 1, label: 'Castel 65cl', group: '★ Fréquents', sublabel: 'bouteille' },
  { id: 2, label: 'Guinness', group: '★ Fréquents' },
  { id: 3, label: 'Poulet', group: 'Vivres' },
  { id: 4, label: 'Plantain', group: 'Vivres' },
  { id: 5, label: 'Pastis 51' },
  { id: 6, label: 'Coca-Cola' },
  { id: 7, label: 'Fanta' },
  { id: 8, label: 'Sprite' },
  { id: 9, label: 'Eau minérale' },
  { id: 10, label: 'Café Touba' },
];

describe('filterComboOptions', () => {
  it('requête vide : les max premières options, ordre préservé (fréquents en tête)', () => {
    const res = filterComboOptions(opts, '', 8);
    expect(res).toHaveLength(8);
    expect(res[0].label).toBe('Castel 65cl');
  });
  it('filtre insensible à la casse et aux accents, en « contient »', () => {
    expect(filterComboOptions(opts, 'CAST', 8).map((o) => o.label)).toEqual(['Castel 65cl']);
    expect(filterComboOptions(opts, 'cafe', 8).map((o) => o.label)).toEqual(['Café Touba']);
    expect(filterComboOptions(opts, 'anta', 8).map((o) => o.label)).toEqual(['Plantain', 'Fanta']);
  });
  it('respecte max même en filtrant', () => {
    expect(filterComboOptions(opts, 'a', 3)).toHaveLength(3);
  });
});

describe('resolveExact', () => {
  it('résout une égalité exacte normalisée (casse/accents)', () => {
    expect(resolveExact(opts, 'castel 65CL')?.id).toBe(1);
    expect(resolveExact(opts, 'CAFÉ touba')?.id).toBe(10);
  });
  it('ne résout pas un préfixe, un texte vide ou un inconnu', () => {
    expect(resolveExact(opts, 'Castel')).toBeNull();
    expect(resolveExact(opts, '')).toBeNull();
    expect(resolveExact(opts, 'Whisky')).toBeNull();
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** `src/lib/combo-filter.ts` :

```ts
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
```

- [ ] **Step 4:** Run ciblé → 5 verts. Full `npm test` → 178 (173 + 5). `npx tsc --noEmit`, `npm run lint` 0/0.
- [ ] **Step 5: Commit** — `feat(ui): logique de filtrage du combobox (TDD)`

### Task 2: Composant Combobox

**Files:**
- Create: `src/components/ui/combobox.tsx`

- [ ] **Step 1: Implémenter** (le composant consomme UNIQUEMENT combo-filter pour sa logique) :

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { filterComboOptions, resolveExact, type ComboOption } from '@/lib/combo-filter';

export type { ComboOption };

// Champ produit/article avec autocomplétion (spec combobox §2). Le champ visible
// porte le NOM ; l'id (ou le label si valueAs="label") part dans un input hidden —
// le contrat FormData des actions serveur est inchangé. L'état interne s'aligne
// sur le cycle de vie des formulaires maison : remontage par key={attempt} (via
// defaultValue) et formRef.reset() (écoute de l'événement reset natif).
export function Combobox({
  name, options, defaultValue, placeholder, required, valueAs = 'id', onSelect, className = '',
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: number | string;
  placeholder?: string;
  required?: boolean;
  valueAs?: 'id' | 'label';
  onSelect?: (id: number | null) => void;
  className?: string;
}) {
  const initial = defaultValue != null && defaultValue !== ''
    ? options.find((o) => String(o.id) === String(defaultValue)) ?? null
    : null;
  const [text, setText] = useState(initial?.label ?? '');
  const [chosen, setChosen] = useState<ComboOption | null>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // formRef.current?.reset() des parents (succès de soumission) doit aussi vider
  // l'état interne du combobox : on écoute le reset NATIF du formulaire hôte.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => { setText(''); setChosen(null); setOpen(false); };
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, []);

  // Fermeture au tap hors du composant.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const suggestions = filterComboOptions(options, chosen ? '' : text, 8);
  const pick = (o: ComboOption) => {
    setText(o.label); setChosen(o); setOpen(false); onSelect?.(o.id);
  };
  const hiddenValue = chosen ? (valueAs === 'label' ? chosen.label : String(chosen.id)) : '';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input type="hidden" name={name} value={hiddenValue} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={text}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="bg-night border border-line rounded-[10px] p-3 text-cream placeholder:text-muted focus:outline-2 focus:outline-action min-h-12 w-full pr-9"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          // Texte modifié après sélection -> l'id n'est plus garanti : on l'invalide.
          if (chosen) { setChosen(null); onSelect?.(null); }
          setOpen(true); setActive(0);
        }}
        onBlur={() => {
          // Résolution exacte : « castel 65cl » tapé puis champ suivant, sans tap.
          if (!chosen && text.trim()) {
            const exact = resolveExact(options, text);
            if (exact) { setText(exact.label); setChosen(exact); onSelect?.(exact.id); }
          }
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') {
            // Entrée choisit la suggestion active au lieu de soumettre le formulaire.
            if (suggestions[active]) { e.preventDefault(); pick(suggestions[active]); }
          } else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {(text !== '' || chosen) && (
        <button type="button" aria-label="Effacer"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-cream px-1"
          onPointerDown={(e) => {
            e.preventDefault();
            setText(''); setChosen(null); setOpen(false); onSelect?.(null);
            inputRef.current?.focus();
          }}>
          ×
        </button>
      )}
      {open && suggestions.length > 0 && (
        <ul role="listbox"
          className="absolute z-10 inset-x-0 top-full mt-1 bg-card border border-line rounded-[10px] max-h-64 overflow-y-auto shadow-lg">
          {suggestions.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}
              className={`px-3 py-2.5 cursor-pointer ${i === active ? 'bg-surface' : ''}`}
              // onPointerDown (pas onClick) : la sélection doit précéder le blur de l'input,
              // sinon la liste se ferme avant que le tap n'atteigne l'option.
              onPointerDown={(e) => { e.preventDefault(); pick(o); }}
              onPointerMove={() => setActive(i)}>
              {o.group && <span className="text-muted text-[10px] uppercase tracking-wider mr-2">{o.group}</span>}
              <span className="text-cream">{o.label}</span>
              {o.sublabel && <span className="text-muted text-xs ml-2">{o.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

NOTE `suggestions` : quand une option est déjà choisie (`chosen`), la liste au re-focus propose la tête de liste (requête traitée comme vide) — retaper ou effacer pour chercher autre chose.

- [ ] **Step 2:** `npx tsc --noEmit`, `npm run lint` 0/0 (le composant n'est encore importé nulle part — pas de test dédié : la logique est couverte par T1, le comportement par la vérif navigateur de T6).
- [ ] **Step 3: Commit** — `feat(ui): composant Combobox (champ + suggestions, id en champ caché)`

### Task 3: Intégration Commandes + Sorties

**Files:**
- Modify: `src/app/(protected)/commandes/order-form.tsx`, `src/app/(protected)/sorties/exit-form.tsx`

Pour CHACUN des deux formulaires (ils sont jumeaux — lire les deux AVANT de commencer) :

- [ ] **Step 1:** Retirer : l'import et l'usage de `SearchBox`, l'import de `Select` (si plus utilisé dans le fichier) et de `matchesQuery`, les états `query` et `selected`, la fonction `optionsFor`, et le `setSelected({})` du useEffect de succès (avec son commentaire « Les selects étant contrôlés… » — le reset natif suffit désormais, le Combobox écoute l'événement). Mettre à jour le commentaire de préservation React 19 : les combobox se réinitialisent via `defaultValue` au remontage `key={attempt}`.
- [ ] **Step 2:** Construire les options aplaties (avant le return) :

```tsx
// Options aplaties pour le Combobox : l'ordre des groupes (★ Fréquents puis
// catégories) est préservé par flatMap ; le groupe s'affiche en petit libellé.
const options = groups.flatMap((g) => g.products.map((p) => ({
  id: p.id, label: p.name, group: g.label,
  sublabel: p.baseUnit, // order-form : + conditionnement, voir ci-dessous
})));
```

Pour order-form.tsx, `sublabel` = `` `${p.baseUnit}${p.packName ? `, ${p.packName}=${p.packSize}` : ''}` `` (même info qu'aujourd'hui).

- [ ] **Step 3:** Remplacer le `<Select name="lineProduct" …>` de chaque ligne par :

```tsx
<Combobox name="lineProduct" className="flex-1" placeholder="Produit…"
  options={options} defaultValue={v?.lines[i]?.productId || undefined} />
```

(import `Combobox` depuis '@/components/ui/combobox'. Le `defaultValue` restaure le produit après une erreur — `values.lines[i].productId` est déjà renvoyé par les actions ; `|| undefined` évite la chaîne vide.)

- [ ] **Step 4:** Vérifier à la lecture : le jeton d'idempotence (exit-form) et le reste du formulaire inchangés ; chaque formulaire garde exactement son bouton `type="submit"`.
- [ ] **Step 5:** `npm test` (178 — les tests d'actions ne changent pas), `npx tsc --noEmit`, `npm run lint` 0/0, `npm run build`.
- [ ] **Step 6: Commit** — `feat(ui): autocomplétion des produits dans Commandes et Sorties`

### Task 4: Intégration Fiches techniques + Ajustements

**Files:**
- Modify: `src/app/(protected)/admin/articles/article-form.tsx`, `src/app/(protected)/admin/ajustements/adjustment-form.tsx`

- [ ] **Step 1 (article-form):** lire le fichier ; remplacer le `<Select name="lineProduct" …>` de chaque ligne d'ingrédient par un `Combobox name="lineProduct"` avec `options={products.map((p) => ({ id: p.id, label: p.name, sublabel: p.baseUnit }))}` (les noms « (inactif) » injectés par la page en édition sont des labels comme les autres) et `defaultValue` reprenant la logique actuelle du Select (values préservées OU `initial?.lines[i]?.productId`). Retirer l'import `Select` s'il ne sert plus qu'au `locationId` — le garder alors uniquement pour lui.
- [ ] **Step 2 (adjustment-form):** lire le fichier ; remplacer le `<Select name="productId" required …>` par :

```tsx
<Combobox name="productId" required placeholder="Produit…"
  options={products.map((p) => ({ id: p.id, label: p.name, sublabel: p.baseUnit }))}
  defaultValue={v.productId || undefined} />
```

Respecter la grille existante (`grid-cols-2`) : si le Select occupait une colonne, conserver la même occupation (ou `col-span-2` si le champ était pleine largeur — reproduire l'existant).

- [ ] **Step 3:** `npm test` (178), `npx tsc --noEmit`, `npm run lint` 0/0, `npm run build`.
- [ ] **Step 4: Commit** — `feat(admin): autocomplétion produit dans fiches techniques et ajustements`

### Task 5: Intégration Correspondance caisse + filtres Mouvements

**Files:**
- Modify: `src/app/(protected)/compta/imports/match-form.tsx`, `src/app/(protected)/compta/mouvements/page.tsx`

- [ ] **Step 1 (match-form):** remplacer le `<Select ref={selectRef} name="cashName" …>` par :

```tsx
<Combobox name="cashName" valueAs="label" placeholder="Article caisse…" className="flex-1 min-w-40"
  options={articles.map((a) => ({ id: a.id, label: a.cashName }))} />
```

Supprimer `selectRef` ; adapter le `onSubmit` pour lire la valeur du champ caché via le formulaire :

```tsx
onSubmit={(e) => {
  const selected = (e.currentTarget.elements.namedItem('cashName') as HTMLInputElement | null)?.value ?? '';
  if (!selected) { e.preventDefault(); return; } // rien de sélectionné -> pas d'envoi
  if (!confirm(`Associer « ${raw} » à ${selected} ? Cette correspondance s'appliquera aussi aux prochains imports.`)) {
    e.preventDefault();
  }
}}
```

(Comportement AMÉLIORÉ voulu par la spec : plus de présélection du 1er article ; sans sélection, le submit est bloqué silencieusement.)

- [ ] **Step 2 (mouvements/page.tsx):** remplacer les DEUX `<Select>` produit et article par des Combobox (la page reste un composant serveur — le Combobox est une feuille cliente) :

```tsx
<label className="space-y-1"><span className="text-muted text-xs">Produit</span>
  <Combobox name="produit" placeholder="Tous" className="w-full"
    options={allProducts.map((p) => ({ id: p.id, label: p.name + (p.active ? '' : ' (inactif)') }))}
    defaultValue={produit?.id} /></label>
<label className="space-y-1 col-span-2"><span className="text-muted text-xs">Article caisse (filtre ses ingrédients)</span>
  <Combobox name="article" placeholder="Tous" className="w-full"
    options={allArticles.map((a) => ({ id: a.id, label: a.cashName }))}
    defaultValue={article?.id} /></label>
```

(Import de `Combobox` ; `Select` reste importé pour Emplacement. Champ vide → `produit=""` dans l'URL → `Number('') = 0` → aucun match → « tous », comportement identique à l'option « Tous » actuelle.)

- [ ] **Step 3:** `npm test` (178), `npx tsc --noEmit`, `npm run lint` 0/0, `npm run build`.
- [ ] **Step 4: Commit** — `feat(compta): autocomplétion dans la correspondance caisse et les filtres Mouvements`

### Task 6: Balayage + README (la vérification navigateur est faite par le CONTRÔLEUR après cette tâche)

- [ ] **Step 1:** `npm test` → **178 tests / 33 fichiers attendus**. `npx tsc --noEmit`, `npm run lint` (0/0), `npm run build` propres.
- [ ] **Step 2:** Greps de contrôle :
  - `grep -rn "SearchBox" src/app` → seul l'inventaire (non concerné) doit rester.
  - `grep -rn '<Select' src/app` → uniquement rôle (user-form), emplacement (article-form, adjustment-form, mouvements/page), et AUCUN select de produit/article.
  - `grep -rn 'name="lineProduct"\|name="productId"\|name="cashName"\|name="produit"\|name="article"' src/app` → tous portés par des Combobox (ou input hidden interne).
  - `git diff 74d6382..HEAD --stat -- src/lib src/app` → uniquement les fichiers de la structure du plan ; AUCUNE action (actions.ts) modifiée.
- [ ] **Step 3:** README : une phrase dans la section utilisation mentionnant la saisie par autocomplétion (produits/articles). Diff minimal.
- [ ] **Step 4: Commit** — `docs: README — saisie par autocomplétion`

Après T6, le contrôleur exécute la vérification navigateur de la spec §5 (serveur dev, viewport mobile : Commandes → taper « cast », sélectionner, quantité, soumettre ; erreur de validation → saisie préservée ; filtres Mouvements → GET avec produit=<id>).

---

## Auto-révision du plan

**Couverture spec :** §2.1-2.2 (T2 — contrat complet, focus/filtrage/pick/blur/×/clavier/aria/reset natif/pointerdown), §2.3 (T1 — logique pure TDD), §3.1-3.5 (T3/T4/T5 — 6 écrans, SearchBox retirée, cashName valueAs=label sans présélection, filtres GET), §3.6 (inventaire intouché — vérifié par grep T6), §4 (tests T1, actions intactes), §5 (vérif navigateur post-T6 par le contrôleur), §6-7 respectés.

**Points d'attention exécutant :**
- Comptes de tests indicatifs (173→178) ; AUCUN test existant modifié ; AUCUNE action serveur touchée (T6 le vérifie par diffstat).
- T3 : la disparition de l'état `selected` change la préservation en erreur : le produit revient désormais par `values.lines[i].productId` → `defaultValue` au remontage `key={attempt}` — c'est le MÊME mécanisme que les quantités ; vérifier que les actions renvoient bien `productId` dans values (oui : `formData.getAll('lineProduct')`).
- T3 : sur `state.success`, `formRef.current?.reset()` déclenche l'événement `reset` natif que le Combobox écoute — ne PAS réintroduire de reset manuel.
- T5 (match-form) : `elements.namedItem('cashName')` retourne l'input HIDDEN du Combobox — c'est voulu.
- T5 (mouvements) : la page est un Server Component — le Combobox y est importé comme composant client (feuille), ses props sont sérialisables (options plates). AUCUNE autre logique de la page ne bouge.
- T2 : `value={hiddenValue}` sur l'input hidden est contrôlé par l'état interne — pas de warning React puisque hidden n'a pas d'onChange requis... si React râle (« controlled without onChange »), ajouter `readOnly`.
