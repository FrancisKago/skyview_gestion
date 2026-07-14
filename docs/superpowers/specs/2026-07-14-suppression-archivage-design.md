# Spec — Suppression et archivage des produits et articles obsolètes

**Date :** 2026-07-14
**Statut :** validé (brainstorm interactif ; décisions : suppression seulement sans AUCUNE référence, archivage unifié avec l'état actif, migration `active` sur sale_articles)

## 1. Objectif

Permettre à l'admin de faire le ménage dans le catalogue : **supprimer** définitivement les produits et articles jamais utilisés (aucune référence nulle part), et **archiver** ceux qui ont un historique (ils disparaissent des saisies mais restent dans l'historique). L'archivage est l'état « inactif » existant, assumé et exposé clairement ; les articles caisse gagnent le même état.

## 2. Migration (première depuis la v1)

- `sale_articles` : `ADD COLUMN active boolean NOT NULL DEFAULT true` — générée par drizzle-kit (`drizzle/0005_*.sql`), schéma `src/db/schema.ts` mis à jour (`active: boolean('active').notNull().default(true)`).
- Les articles existants restent actifs. Aucune autre table modifiée.
- Déploiement : appliquer la migration sur Neon (`npx drizzle-kit migrate`, comme les migrations initiales — la procédure du README s'applique) AVANT de servir le nouveau code.

## 3. Libs (ajouts purs, TDD)

### 3.1 `deleteProduct(db, id)` — src/lib/products.ts

- Produit introuvable → `{ ok: false, error: 'Produit introuvable' }`.
- Compte les références externes : `recipe_lines`, `order_lines`, `stock_movements`, `service_exit_lines`, `inventory_lines` (une requête agrégée ou une par table — peu importe, volume faible).
- S'il y en a → `{ ok: false, referenced: true, error: 'Produit utilisé (<détail>) — archivez-le plutôt' }` où `<détail>` liste les compteurs non nuls en français (ex. « 2 fiche(s) technique(s), 5 mouvement(s) de stock »).
- Sinon `DELETE` → `{ ok: true }`.

### 3.2 `deleteSaleArticle(db, id)` — src/lib/sale-articles.ts

- Même contrat. Références EXTERNES = `sales_import_lines` uniquement (« <n> vente(s) importée(s) »).
- Les `recipe_lines` de l'article lui-même sont SA composition (cascade en base) : elles ne bloquent pas la suppression et partent avec lui.

### 3.3 `archiveProduct(db, id, archived)` / `archiveSaleArticle(db, id, archived)`

- Basculent `active = !archived`. Introuvable → erreur. Idempotent (ré-archiver un archivé = ok).
- `archiveProduct` est le mécanisme « Produit actif » existant exposé en fonction dédiée — `saveProduct` inchangé.

### 3.4 LOGIQUE INTOUCHABLE

`saveProduct`, `saveSaleArticle`, imports, mouvements : inchangés hors les effets de bord UI listés en §5.

## 4. Server actions + UI des listes admin

### 4.1 Actions (dans les actions.ts existants de produits et articles)

- `deleteProductAction`, `archiveProductAction` (produits) ; `deleteSaleArticleAction`, `archiveSaleArticleAction` (articles). Conventions maison : `requireRole(['admin'])` en tête, id via `formNumber`, try/catch → « Service indisponible… », `revalidatePath` en succès. Les erreurs de suppression (référencé) remontent à l'UI.
- La suppression ne redirige pas (on reste sur la liste). Chaque ligne porte un petit formulaire client (`useActionState`) pour Supprimer/Archiver ; l'erreur éventuelle s'affiche en ligne sous la ligne concernée via `FormError` (convention maison). Succès → `revalidatePath` rafraîchit la liste.

### 4.2 Listes

- **Produits** (`product-list.tsx`) : chaque ligne gagne, à côté de « Modifier » : « Archiver » (ou « Désarchiver » si `!active`, avec badge « archivé » sur la ligne) et « Supprimer ». « Supprimer » n'est AFFICHÉ que si l'élément est supprimable (info calculée côté serveur et passée à la liste) — le serveur revérifie de toute façon dans la lib. `confirm()` natif avant suppression : « Supprimer définitivement « X » ? Cette action est irréversible. »
- **Articles** (liste dans `admin/articles/page.tsx`) : mêmes trois gestes, même badge.
- Les archivés restent dans la même liste (badge), pas de section séparée.

## 5. Effets de bord des articles archivés (alignés sur les produits inactifs)

- **Correspondance caisse** (`match-form`) : les articles archivés disparaissent des options du combobox.
- **Auto-match des imports de ventes** (`storeSalesImport`) : INCHANGÉ — un cashName archivé continue d'être reconnu (continuité si l'article réapparaît dans un export caisse). Documenté ici, pas de code.
- **Filtre Article de Mouvements** : les archivés restent listés avec suffixe « (archivé) » (l'historique ne s'efface pas).
- **Création/édition de fiche** (article-form) : inchangé (l'archivage ne bloque pas l'édition d'une fiche existante).
- Les produits inactifs conservent leurs comportements actuels (déjà traités dans les phases précédentes) ; le libellé UI devient « archivé » là où la liste produits affiche l'état, mais la case « Produit actif » du formulaire d'édition reste telle quelle (même mécanisme, deux portes d'entrée).

## 6. Tests (~10 nouveaux, PGlite)

1. `deleteProduct` : jamais référencé → supprimé ; référencé par une fiche → refus avec « fiche » dans le motif ; par un mouvement → refus ; par une commande → refus ; introuvable → erreur.
2. `deleteSaleArticle` : jamais vendu → supprimé (et SES recipe_lines disparaissent — cascade) ; référencé par une vente importée → refus ; introuvable → erreur.
3. `archiveProduct` / `archiveSaleArticle` : bascule + idempotence.
4. Migration : un article inséré sans `active` est actif par défaut (implicite via les tests existants qui doivent rester verts).

Suite attendue : 178 → ~188. Aucun test existant modifié (les inserts existants de saleArticles ne mentionnent pas `active` → défaut true → verts).

## 7. Vérification navigateur (fin de phase)

Base PGlite jetable (recette `.claude/skills/verify/SKILL.md`, DEV_PGLITE_DIR appendu au .env.local) : supprimer un produit jamais utilisé (confirm → disparu) ; tenter la suppression d'un produit utilisé (bouton absent, et l'action serveur refuse si forcée) ; archiver/désarchiver un article (badge, disparition du combobox de correspondance caisse) ; viewport mobile.

## 8. Conventions

Branche `feature/suppression-archivage`. Règles habituelles (type="submit" explicite, FormError, messages français). La migration est le SEUL changement de schéma.

## 9. Hors périmètre

Suppression en masse ; corbeille/restauration après suppression ; archivage automatique par ancienneté ; suppression d'utilisateurs ou d'emplacements.
