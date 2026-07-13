# Spec — Autocomplétion des champs produit/article (Combobox)

**Date :** 2026-07-13
**Statut :** validé (brainstorm interactif ; décisions : tous les champs produit/article, fréquents au focus, SearchBox retirée, combobox maison)

## 1. Objectif

Avec 300+ produits et articles, les `<select>` natifs ouvrent des popups de sélection inutilisables sur téléphone. Remplacer tous les champs de sélection de produit/article par un champ de saisie avec autocomplétion : l'utilisateur tape le nom, des suggestions filtrées s'affichent sous le champ, un tap sélectionne.

## 2. Composant `Combobox` — `src/components/ui/combobox.tsx` (nouveau, client)

### 2.1 Contrat

```ts
export interface ComboOption { id: number; label: string; sublabel?: string; group?: string }

<Combobox
  name="lineProduct"       // nom du champ caché soumis
  options={options}        // liste plate PRÉ-ORDONNÉE (fréquents d'abord le cas échéant)
  defaultValue={id}        // présélection optionnelle (édition, values préservées)
  placeholder="Produit…"
  required                 // optionnel : required sur le champ VISIBLE (un hidden n'est pas validé par le navigateur) ; la garantie d'un id valide reste côté serveur
  valueAs="id" | "label"   // défaut "id" ; "label" soumet le label (cas cashName)
  onSelect={(id|null)=>…}  // optionnel
  className                // optionnel
/>
```

Le champ caché porte l'ID (ou le label si `valueAs="label"`) — les actions serveur lisent des `FormData` identiques à aujourd'hui : **aucun changement serveur**.

### 2.2 Comportement

- **Focus champ vide** → les 8 premières options de la liste (donc « ★ Fréquents » en tête là où le parent les a triées), avec `group` affiché en petit libellé au fil de la liste.
- **Saisie** → filtrage insensible casse/accents via `normalizeText` (matching « contient »), 8 suggestions max.
- **Tap/Entrée sur une suggestion** → label affiché dans le champ, id dans le champ caché, liste fermée.
- **Résolution exacte au blur** : si le texte tapé égale exactement (normalisé) le label d'une option, elle est sélectionnée automatiquement — on peut taper « castel » puis passer au champ suivant.
- **Texte libre non résolu** → champ caché vide ; les validations serveur existantes s'appliquent (ex. « Ligne incomplète… »). Le champ visible garde le texte (l'utilisateur voit ce qu'il a tapé).
- **Bouton « × »** pour vider (visible quand une valeur est posée). **Modifier le texte après sélection** invalide l'id (champ caché revidé) jusqu'à nouvelle résolution.
- **Clavier** : ↓/↑ naviguent, Entrée sélectionne la suggestion active (et NE soumet PAS le formulaire quand la liste est ouverte — preventDefault), Échap ferme. Aria de base : `role="combobox"`, `aria-expanded`, liste `role="listbox"`, options `role="option"` + `aria-selected`.
- **Fermeture au tap extérieur** (pointerdown listener), et la sélection au tap sur une option se fait AVANT le blur (onPointerDown, pas onClick — sinon le blur ferme la liste avant le clic).
- **Style** : tokens de `fields.tsx` (mêmes classes FIELD), liste `absolute` sous le champ (`z-10`, `bg-card`, `border-line`, `rounded-[10px]`, `max-h-64 overflow-y-auto`), option active `bg-surface`.

### 2.3 Logique pure extraite (testable)

`src/lib/combo-filter.ts` (nouveau) :
- `filterComboOptions(options, query, max=8)` : query vide → `options.slice(0, max)` ; sinon filtre `normalizeText(label).includes(normalizeText(query))`, max résultats.
- `resolveExact(options, text)` : l'option dont `normalizeText(label) === normalizeText(text)`, sinon null (si plusieurs — improbable, labels uniques —, la première).

Le composant n'a AUCUNE logique de filtrage propre : il consomme ces deux fonctions.

## 3. Intégrations (6 écrans)

1. **Commandes** (`order-form.tsx`) & **Sorties** (`exit-form.tsx`) : chaque `Select lineProduct` → `Combobox name="lineProduct"`. Options aplaties depuis les `groups` existants (`group` = label du groupe : « ★ Fréquents », catégories ; `sublabel` = `baseUnit` + conditionnement s'il existe). **SearchBox retirée**, états `query`/`selected` et l'épinglage supprimés (le combobox porte sa valeur). Les `values` préservées après erreur repassent en `defaultValue` (le remontage `key={attempt}` réapplique tout). Reset après succès : le composant ÉCOUTE l'événement `reset` natif de son formulaire (via ref sur l'input → `input.form.addEventListener('reset', …)`) et vide son état interne — ainsi le `formRef.current?.reset()` existant des parents vide aussi les combobox, sans remontage supplémentaire.
2. **Fiches techniques** (`admin/articles/article-form.tsx`) : lignes d'ingrédients → Combobox ; les produits « (inactif) » injectés en édition restent des options normales ; `defaultValue` depuis `initial`/`values`.
3. **Ajustements** (`admin/ajustements/adjustment-form.tsx`) : `Select productId` → `Combobox name="productId"` (sublabel = unité). Le Select Emplacement reste.
4. **Correspondance caisse** (`compta/imports/match-form.tsx`) : `Select cashName` → `Combobox name="cashName" valueAs="label"`. Plus de présélection du 1er article (piège actuel) ; `confirm()` conservé, avec le libellé sélectionné dans le message ; « Associer » reste le submit.
5. **Filtres Mouvements** (`compta/mouvements/page.tsx`) : Selects Produit et Article → Combobox (feuilles clientes dans le formulaire GET ; noms `produit`/`article`, `valueAs="id"`, `defaultValue` = filtre courant). Le Select Emplacement reste. La page reste un composant serveur.
6. **Inventaire** : non concerné (liste filtrée SearchBox, pas de popup).

Les selects non-produit (rôle, emplacement) ne changent pas.

## 4. Tests

- `tests/unit/combo-filter.test.ts` (nouveau) : vide → 8 premiers ; filtre accents/casse ; max respecté ; resolveExact exact/absent/normalisé. (~4-5 tests)
- Les tests d'actions existants restent verts SANS modification (le contrat FormData ne change pas).
- Suite attendue : 173 → ~177-178. Aucun test existant modifié.

## 5. Vérification navigateur (obligatoire, fin de phase)

Serveur dev + base de dev : sur Commandes, taper « cast » dans une ligne, sélectionner la suggestion, saisir une quantité, soumettre → la commande est créée (même POST qu'avant) ; vérifier le reset après succès ; vérifier qu'une erreur de validation préserve la saisie ; vérifier les filtres Mouvements (le GET porte bien `produit=<id>`); mobile viewport.

## 6. Conventions

Branche `feature/combobox-autocompletion`. Règles habituelles (type="submit" explicite, messages français, LOGIQUE INTOUCHABLE : aucune action serveur ni lib métier modifiée — seuls les composants formulaires listés et la page mouvements changent, plus les 2 nouveaux fichiers).

## 7. Hors périmètre

Virtualisation de liste ; recherche floue (Levenshtein) dans le combobox ; création de produit à la volée ; selects rôle/emplacement ; inventaire.
