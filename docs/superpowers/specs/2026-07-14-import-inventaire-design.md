# Spec — Import Excel/CSV d'inventaire

**Date :** 2026-07-14
**Statut :** validé (brainstorm interactif ; décisions : produits absents du fichier NON comptés (intacts), 3ᵉ carte sur la page Imports admin)

## 1. Objectif

Permettre à l'admin d'importer un fichier Excel/CSV de comptage d'inventaire pour un emplacement (Bar ou Cuisine — le magasin est suivi dans Odoo, hors périmètre), avec template téléchargeable comme les imports produits/articles. L'import produit les mêmes effets qu'un inventaire saisi à la main : écarts calculés, mouvements `ajustement_inventaire`, inventaire enregistré.

## 2. Template `inventaire`

- `INVENTORY_HEADERS = ['Produit', 'Quantité comptée']` dans `src/lib/templates.ts` ; `buildTemplate` accepte le type `'inventaire'` (xlsx : feuille « À remplir » + feuille « Exemples » avec 2-3 lignes d'exemple et la ligne de règles : « une ligne par produit compté ; les produits absents du fichier ne sont PAS comptés et gardent leur stock ; virgules décimales acceptées » ; csv : BOM + `;`).
- Route `/admin/imports/template` : `type` accepte `inventaire` (validation étendue). Nom de fichier `template-inventaire.xlsx|csv`.

## 3. Lib `importInventory` — `src/lib/import-inventory.ts` (nouveau, TDD)

`importInventory(db, rows: ParsedRow[], { locationId, inventoryDate, countedBy })` → `{ ok, error?, report? }` avec `report = { counted, duplicates, rejects: [{line, reason}], gaps: InventoryGap[] }`.

- **Résolution des noms** : produits matchés par nom normalisé (`normalizeText`), TOUS les produits (actifs et archivés — on peut compter un produit archivé encore en rayon). Introuvable → rejet avec suggestion `suggestClosest` (« vouliez-vous « X » ? »), comme l'import d'articles.
- **Quantités** : `toNumber` (virgule ok) ; non numérique ou < 0 → rejet. 0 est VALIDE (produit compté à zéro).
- **Doublons internes** (même produit sur plusieurs lignes) : la DERNIÈRE ligne fait foi, chaque doublon compté dans `duplicates` — cohérent avec la fusion de `validateInventory` (un comptage ne s'additionne pas).
- **Rejets non bloquants** : les lignes rejetées sont listées, les lignes valides sont comptées (produit rejeté = non compté, il garde son stock — cohérent avec la sémantique « absents intacts »).
- **Zéro ligne valide** → `{ ok: false, error: 'Aucune ligne exploitable', report: { counted: 0, duplicates, rejects, gaps: [] } }` — le rapport accompagne l'erreur pour que l'UI affiche les rejets (sinon l'utilisateur ne saurait pas POURQUOI rien n'est passé).
- **Délégation** : UN SEUL appel à `validateInventory(db, { locationId, inventoryDate, countedBy, lines })` — la lib existante est INTOUCHÉE (elle calcule les écarts, écrit les mouvements et l'inventaire, statut valide). Son erreur éventuelle (date invalide…) remonte telle quelle. Les `gaps` retournés alimentent le rapport.

## 4. UI — 3ᵉ carte sur `/admin/imports`

- Carte « Inventaire » sous les deux existantes : `TemplateLinks type="inventaire"`, texte d'aide (« Compte uniquement les produits listés ; les absents gardent leur stock. »), et un formulaire DÉDIÉ `InventoryImportForm` (client, nouveau fichier) :
  - champs : fichier (accept .csv,.xlsx,.xls, required), **Emplacement** (select Bar/Cuisine, required), **Date d'inventaire** (DateField, défaut aujourd'hui), bouton « Importer l'inventaire » type="submit". PAS de case « mettre à jour ».
  - rapport : ligne de synthèse (`N produit(s) compté(s) · N doublon(s) · N rejeté(s)`), rejets ligne par ligne (rouge), puis le TABLEAU DES ÉCARTS (Produit · Théorique · Compté · Écart · FCFA) — mêmes conventions visuelles que le rapprochement (écart ≠ 0 surligné, total valorisé).
  - reset du formulaire après succès (pattern ImportForm existant).
- Action `importInventoryAction` dans `admin/imports/actions.ts` : conventions maison (requireRole admin, plafond `MAX_UPLOAD_BYTES`, parseTable avec `INVENTORY_HEADERS`, validation de l'emplacement (id ∈ bar/cuisine) et de la date (`isValidDateString`), try/catch, revalidatePath en succès sur `/admin/imports`, `/stock`, `/inventaire` et `/compta/mouvements` — le stock et l'historique affichés changent).
- `ImportForm` existant : INCHANGÉ (les deux premières cartes ne bougent pas).

## 5. Sémantique confirmée

- Produits absents du fichier : NON comptés, stock intact (inventaires partiels possibles).
- L'import est exactement un inventaire : visible dans l'historique des inventaires et les mouvements (type « Ajustement inventaire »), `countedBy` = l'admin qui importe.
- Emplacements proposés : Bar et Cuisine uniquement (magasin non journalisé — Odoo).

## 6. Tests (~6, PGlite) — `tests/integration/import-inventory.test.ts`

1. Comptage nominal : 2 produits, écarts corrects (théorique vs compté), mouvements `ajustement_inventaire` créés, `counted=2`.
2. Produit introuvable → rejet avec suggestion, les autres lignes passent.
3. Quantité invalide (négative, non numérique) → rejets ; quantité 0 → valide (écart négatif complet).
4. Doublon interne : dernière ligne fait foi, `duplicates` incrémenté.
5. Zéro ligne valide → ok:false.
6. Produit archivé compté → accepté.

Suite : 190 → ~196. Aucun test existant modifié.

## 7. Vérification navigateur (fin de phase, contrôleur)

Base PGlite jetable : télécharger le template inventaire, importer un fichier avec un produit connu + un inconnu → rapport avec écart et rejet+suggestion ; vérifier le mouvement dans /compta/mouvements ; viewport mobile.

## 8. Conventions & hors périmètre

Branche `feature/import-inventaire`. Aucune migration. LOGIQUE INTOUCHABLE : `validateInventory`, `parseTable`, `ImportForm` existants inchangés (templates.ts et la route reçoivent des ajouts purs).
Hors périmètre : import magasin (Odoo), inventaire complet « absents = 0 », import multi-emplacements en un fichier.
