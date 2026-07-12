# Spécification — Édition admin (produits, articles, utilisateurs) + templates & import en masse

**Date** : 12 juillet 2026
**Statut** : validé en brainstorming, en attente de revue finale utilisateur

## 1. Problème et objectif

L'admin ne peut aujourd'hui que créer : produits, articles de vente et comptes ne sont pas modifiables depuis l'interface (limitation v1 connue), et la constitution du catalogue se fait ligne à ligne. Objectif : (a) permettre à l'admin de **modifier** produits, articles et utilisateurs ; (b) fournir des **templates téléchargeables** (.xlsx et .csv) et un **import en masse** des produits et des articles.

## 2. Périmètre

### Inclus
- Édition des produits (tous champs + case « actif »)
- Édition des articles de vente (nom caisse, emplacement, fiche technique complète)
- Édition des utilisateurs (nom, rôle, réinitialisation du mot de passe)
- Page `/admin/imports` : téléchargement des 2 templates en 2 formats + upload avec option « mettre à jour les existants » + rapport détaillé
- Nouvelles fonctions testées en TDD : `updateUser`, parsing de tableaux, `importProducts`, `importArticles`

### Exclus
- Modification de l'identifiant (username) — affiché en lecture seule
- Suppression de produits/articles/utilisateurs (la désactivation existe pour produits et utilisateurs)
- Prévisualisation avant import (v2 possible ; le rapport post-import couvre le besoin)
- Import des utilisateurs

## 3. Édition des produits

- Lien « Modifier » sur chaque ligne de `/admin/produits` → `/admin/produits?edit=<id>`.
- La page (serveur) lit `searchParams.edit`, charge le produit, pré-remplit le formulaire existant : champ caché `id`, `defaultValue` partout, case à cocher « Produit actif » (expose enfin le champ `active`).
- Bouton « Mettre à jour » + lien « Annuler » (retour à `/admin/produits`).
- `saveProduct` (existant) gère l'update — aucune modification de logique métier.

## 4. Édition des articles de vente

- Même mécanique : `/admin/articles?edit=<id>` ; formulaire pré-rempli (nom caisse, emplacement, lignes de fiche technique chargées — le nombre de lignes initial s'adapte).
- `saveSaleArticle` (existant) gère l'update avec remplacement complet de la fiche.
- Texte d'aide affiché en mode édition : le nom caisse doit correspondre exactement à l'export du logiciel de caisse, sinon les prochains imports de ventes ne matcheront plus.

## 5. Édition des utilisateurs

- `/admin/utilisateurs?edit=<id>` ; champs éditables : **nom**, **rôle**, **nouveau mot de passe** (optionnel — vide = conservé ; rempli = minimum 8 caractères).
- **Username en lecture seule** (clé de connexion connue des employés).
- Nouvelle fonction `updateUser(db, { id, name, role, password? })` (TDD) avec :
  - validations identiques à `createUser` (nom requis, rôle dans l'allowlist, mot de passe ≥ 8 si fourni) ;
  - **garde du dernier admin** : refuser de changer le rôle du dernier admin actif vers un rôle non-admin (`'Impossible de retirer le rôle admin au dernier admin actif'`) — symétrique du garde existant de `setUserActive`.

## 6. Page `/admin/imports`

- 5ᵉ entrée de la nav admin : « Imports » (icône lucide FileUp).
- Deux blocs (Card) : **Produits** et **Articles**. Chacun contient :
  - liens de téléchargement du template en **.xlsx** et **.csv** ;
  - formulaire d'upload (accept `.csv,.xlsx,.xls`) avec case **« Mettre à jour les existants »** (décochée par défaut) ;
  - après import, le **rapport** : `X créés · Y mis à jour · Z ignorés · N rejetés`, chaque rejet listé avec numéro de ligne du fichier et motif en français.

## 7. Templates

Générés à la volée par un route handler protégé (admin), avec la lib `xlsx` :

- **Produits** — colonnes : `Nom | Catégorie | Unité de base | Conditionnement | Taille conditionnement | Prix d'achat (FCFA) | Seuil d'alerte`
- **Articles** — colonnes : `Article caisse | Emplacement | Produit | Quantité` (une ligne par ingrédient ; l'article est répété sur chacune de ses lignes)
- En .xlsx : 1ʳᵉ feuille = en-têtes seuls (à remplir) ; 2ᵉ feuille « Exemples » = lignes d'exemple + rappel des règles. **L'import ne lit que la première feuille.**
- En .csv : en-têtes seuls (séparateur `;`, encodage UTF-8).

## 8. Règles d'import

1. **Reconnaissance des en-têtes** : par nom normalisé (casse/accents ignorés) ; en-têtes non reconnus → erreur claire, aucune écriture.
2. **Correspondance des existants par nom normalisé** (`normalizeText`) : « castel 65CL » retrouve « Castel 65cl ». Produits : sur `products.name` ; articles : sur `sale_articles.cash_name` ; produits référencés dans les fiches : sur `products.name`.
3. **Produits** :
   - inexistant → créé (validations de `saveProduct`) ;
   - existant + case décochée → **ignoré** ;
   - existant + case cochée → **mis à jour**, la ligne du fichier fait foi (une cellule optionnelle vide efface le champ : conditionnement, seuil…). Prix obligatoire.
4. **Articles** : lignes regroupées par (article caisse, emplacement) ;
   - un produit référencé introuvable → **groupe entier rejeté**, motif avec suggestion si un nom proche existe ;
   - emplacement invalide (ni Bar ni Cuisine) → groupe rejeté ;
   - existant + case décochée → ignoré ; case cochée → fiche technique **remplacée intégralement**.
5. **Quantités et prix** : virgules décimales acceptées ; valeurs non numériques ou ≤ 0 → ligne/groupe rejeté avec motif.
6. **Indépendance** : chaque produit/groupe est traité indépendamment — un rejet n'annule pas le reste (pas de transaction globale, cohérent avec la convention v1 du driver neon-http).
7. **Doublons internes au fichier** : produits — la dernière ligne du fichier fait foi (signalé dans le rapport) ; articles — les lignes d'un même groupe s'additionnent naturellement dans la fiche.

## 9. Gestion des erreurs

- Fichier illisible/vide → message français, aucune écriture (mêmes conventions que l'import des ventes).
- Chaque rejet : `ligne N : <motif>` ; suggestion « vouliez-vous “X” ? » quand un nom proche existe (distance de Levenshtein ≤ 2 entre noms normalisés ; au plus une suggestion, la plus proche).
- Les actions serveur suivent les conventions maison : `requireRole(['admin'])`, try/catch → « Service indisponible, veuillez réessayer. », revalidation des chemins concernés.
- Formulaires : `FormError`, boutons `type="submit"` explicites, état pending.

## 10. Architecture technique

- **Libs nouvelles (TDD)** : `src/lib/import-table.ts` (parse générique buffer → lignes objet avec numéros, en-têtes attendus), `src/lib/import-products.ts`, `src/lib/import-articles.ts`, `updateUser` dans `src/lib/users.ts` (seul fichier lib existant modifié, ajout pur).
- **Route handler** : `src/app/(protected)/admin/imports/template/route.ts` (GET, query `type=produits|articles`, `format=xlsx|csv`).
- **Pages** : `/admin/imports` (page + 2 upload-forms clients) ; modifications de pré-remplissage sur produits/articles/utilisateurs pages + forms.
- **Réutilisé tel quel** : `saveProduct`, `saveSaleArticle`, `normalizeText`, conventions de parsing de `sales-file.ts` (codepage 65001, `raw:false`), composants UI existants.
- Aucune migration de schéma.

## 11. Tests

1. **TDD** : `updateUser` (update simple, mot de passe optionnel, garde dernier admin), `import-table` (xlsx + csv, en-têtes FR normalisés, virgules décimales, fichier illisible), `importProducts` (création, ignoré, update avec effacement des optionnels vides, rejets, doublons internes), `importArticles` (groupes, produit inconnu + suggestion, emplacement invalide, remplacement de fiche, ignoré/update).
2. Les **93 tests existants inchangés** restent le garde-fou (aucune modification des libs existantes hors ajout `updateUser`).
3. Vérification manuelle : télécharger les 2 templates, les remplir, les importer (avec et sans la case), éditer un produit/article/utilisateur depuis l'interface.

## 12. Critères de succès

- L'admin corrige un prix ou une fiche technique en moins de 30 secondes depuis son téléphone.
- Un catalogue de 100 produits + 80 articles s'importe en 2 fichiers, avec un rapport qui rend chaque rejet actionnable.
- Impossible de se retrouver sans admin actif, quelle que soit la manipulation des comptes.
