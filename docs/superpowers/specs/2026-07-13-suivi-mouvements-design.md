# Spec — Suivi des mouvements de stock (comptable)

**Date :** 2026-07-13
**Statut :** validé (brainstorm interactif, 3 sections approuvées)

## 1. Objectif

Donner au comptable un tableau de suivi des mouvements de stock par emplacement sur une période choisie : stock initial, mouvements ventilés par type, stock final — filtrable par date, produit, article caisse et emplacement, avec le détail chronologique de chaque produit à la demande.

## 2. Contexte et source de vérité

- `stockMovements` est un journal immuable ; le stock d'un emplacement = somme des `qty` signées. Tout est donc dérivable : stock initial = somme avant la période, stock final = initial + net de la période. Aucune migration.
- Le stock du **magasin n'est pas suivi** (les réceptions ne créent des mouvements qu'au bar/cuisine, les ajustements excluent le magasin). Le suivi couvre donc les emplacements bar et cuisine uniquement.
- Types de mouvements existants : `reception` (+), `sortie_service` (−), `ajustement_inventaire` (±), `ajustement_admin` (±).
- Accès : rôle `comptable` uniquement (comme les autres pages `/compta/*`).

## 3. Lib de calcul — `src/lib/movement-report.ts` (nouveau, TDD)

### 3.1 `getMovementReport(db, { from, to, locationId, productIds? })`

Retourne une ligne par produit ayant au moins un mouvement à l'emplacement **avant ou pendant** la période (même sémantique que `getLocationStock` : consommé à zéro → présent avec 0 ; jamais bougé → absent) :

- `initial` : somme des mouvements strictement antérieurs à `from` 00:00
- `receptions` : somme des `reception` de la période (≥ 0)
- `sorties` : somme **absolue** des `sortie_service` de la période (affichée positive)
- `ajustements` : somme **signée** des `ajustement_inventaire` + `ajustement_admin` (une seule colonne ; le détail par produit distingue les deux)
- `final` : dérivé — `initial + receptions − sorties + ajustements` (pas de 3ᵉ requête)
- `initialValue`, `finalValue` : FCFA = quantité × `purchasePrice`, arrondi entier (comme `getLocationStock`)
- Champs d'affichage : `productId`, `name`, `baseUnit`

Implémentation : deux requêtes SQL agrégées (avant-période ; période groupée par type), fusionnées en mémoire, `round3` sur les quantités.

**Bornes de dates :** `from` inclus à partir de 00:00:00, `to` inclus jusqu'à 23:59:59.999 (le comptable raisonne en jours ; `createdAt` est un timestamp). Les mouvements sont datés par **`createdAt`** (moment de l'écriture), pas par `serviceDate` : une sortie saisie le lendemain compte le lendemain — réalité du journal, assumée.

`productIds` optionnel : restreint aux ids fournis (filtre produit unique, ou liste des ingrédients d'un article).

### 3.2 `getMovementDetail(db, { from, to, locationId, productId })`

Journal chronologique (`createdAt` croissant) du produit sur la période : `createdAt`, `type` + libellé français (`Réception`, `Sortie service`, `Ajustement inventaire`, `Ajustement admin`), `qty` signée, `reason` (null hors ajustements), `userName` (join `users`).

## 4. Page — `/compta/mouvements` (nouveau)

`requireRole(['comptable'])`, `export const dynamic = 'force-dynamic'`. 4ᵉ entrée de la nav comptable : `{ href: '/compta/mouvements', label: 'Mouvements', icon: 'mouvements' }`, icône `ArrowLeftRight` ajoutée au map ICONS de `bottom-nav.tsx`.

### 4.1 Filtres (formulaire GET — URL partageable, pas de server action)

- `du`, `au` : `<input type="date">` ; défaut = 1er du mois en cours → aujourd'hui
- `emplacement` : select Tous · Bar · Cuisine (défaut Tous → une section par emplacement)
- `produit` : select Tous + tous les produits, **actifs et inactifs** (suffixe « (inactif) ») — l'historique comptable inclut les produits retirés
- `article` : select Tous + articles caisse ; si choisi, la page résout la fiche technique et filtre sur ses produits ingrédients, avec bandeau explicite « Filtré sur les ingrédients de “X” : … »
- **Exclusivité produit/article :** si les deux sont fournis, `produit` gagne (l'état rendu l'indique)
- Bouton « Filtrer » (`type="submit"` explicite), lien « Réinitialiser » → `/compta/mouvements`
- Paramètres invalides (date illisible, `du > au`, id inconnu) → retour silencieux au défaut du champ concerné, jamais d'écran d'erreur

### 4.2 Tableau (une section par emplacement affiché)

Colonnes : Produit · Initial · Réceptions · Sorties · Ajust. · Final · FCFA (final). Quantités avec unité de base, classe `tnum`, ajustements signés (+/−). Sous chaque tableau, `StatCard` « Valeur du stock : initial → final » (ton `money`). Aucune ligne → `EmptyState`.

### 4.3 Détail par produit

Le nom du produit est un lien ajoutant `&detail=<productId>&detailLoc=<locationId>` : une carte « Journal — <produit> (<emplacement>) » s'insère sous la section (date · type français · quantité signée · motif · par qui), avec lien « Fermer » (retire les deux paramètres). Détail invalide (produit/emplacement inconnu) → carte simplement absente.

## 5. Tests — `tests/integration/movement-report.test.ts` (nouveau, PGlite)

1. Initial exact : mouvements uniquement avant la période → initial ≠ 0, colonnes période à 0, final = initial
2. Ventilation par type : réceptions +, sorties en absolu, ajustements signés (inventaire − et admin + combinés), final = initial + net
3. Bornes : mouvements le jour `from` et le jour `to` inclus ; veille et lendemain exclus
4. `productIds` : seuls les produits listés apparaissent
5. Jamais bougé → absent ; consommé à zéro → présent avec 0
6. Valorisation : `initialValue`/`finalValue` = qté × prix arrondis
7. `getMovementDetail` : ordre chronologique, libellés français, motif et utilisateur présents

Aucun test existant modifié. Suite attendue : 146 existants + les nouveaux.

## 6. Conventions transverses (rappel)

- Branche dédiée ; boutons `type="submit"` explicites ; `FormError` (pas de `state.error && <p`) — ici sans objet car pas de server action ; `requireRole` en tête de page ; textes en français ; classes du thème lounge existantes.
- LOGIQUE INTOUCHABLE : aucune modification des libs existantes — `movement-report.ts` est un fichier neuf ; seuls `layout.tsx` (entrée nav) et `bottom-nav.tsx` (icône) reçoivent des ajouts purs.

## 7. Hors périmètre (v2 possibles)

- Export CSV/Excel du tableau
- Valorisation FCFA des colonnes de mouvements (seuls initial/final sont valorisés)
- Suivi du stock magasin (nécessiterait de journaliser les sorties magasin — changement de modèle, pas un tableau de bord)
- Section « ventes par article » (couverte par le rapprochement existant)
