# Spec — Durcissement post-v1 & export Mouvements

**Date :** 2026-07-13
**Statut :** validé (brainstorm interactif ; décisions : re-vérif BDD dans requireRole, export CSV+Excel avec FCFA dans l'export seulement)

## 1. Objectif

Traiter en une phase les améliorations post-v1 n° 1-5, 7-8 : durcissement du parseur d'imports, plafond d'upload, garde `active` côté serveur, fraîcheur des sessions, typage `AnyDb`, export CSV/Excel de la page Mouvements avec valorisation complète, et outillage lint. (Le n° 6 — produits fréquents en premier — est déjà livré via `getFrequentProducts` + `groupProducts` ; le n° 9 — stock magasin — reste hors périmètre.)

## 2. Durcissement `parseTable` (src/lib/import-table.ts)

Modification chirurgicale de la validation d'en-têtes (le reste de la fonction est inchangé) :

- Cellule d'en-tête **vide au milieu** de la ligne (ex. `Nom;;Prix`) → `{ ok: false, error: 'Colonne d'en-tête vide (position N)' }` (N = position 1-based). Aujourd'hui, le filtre silencieux décale les colonnes de données. Les cellules vides **en fin** de ligne restent tolérées (artefact courant d'export Excel).
- Deux en-têtes qui se **normalisent identiquement** (ex. `Nom;NOM`) → `{ ok: false, error: 'Colonne en double : « X »' }`.
- Les fichiers issus des templates ne changent pas de comportement ; aucun test existant modifié (nouveaux tests uniquement).

## 3. Plafond d'upload — 4 Mo

- Constante exportée `MAX_UPLOAD_BYTES = 4 * 1024 * 1024` dans `src/lib/import-table.ts` (à côté du parseur qu'elle protège).
- Vérifiée dans les 3 actions d'upload : `runImport` (admin/imports) et `uploadSalesAction` (compta/imports) → si `file.size > MAX_UPLOAD_BYTES` : erreur « Fichier trop volumineux (4 Mo maximum) » via l'état FormError habituel.
- Justification : limite de corps de requête de la plateforme (~4,5 Mo) ; un catalogue réel fait quelques dizaines de Ko.

## 4. Garde `active` côté serveur

Un POST forgé ne doit plus pouvoir mouvementer un produit désactivé :

- `createOrder` (src/lib/orders.ts), `recordServiceExit` (src/lib/service-exits.ts), `recordAdjustment` (src/lib/adjustments.ts) : si un `productId` référencé est introuvable OU désactivé → `{ ok: false, error: 'Produit désactivé ou introuvable : « X » ' }` (nom si connu, sinon l'id). Vérification par UNE requête (inArray sur les ids concernés), avant toute écriture.
- **Sans garde** (décisions assumées) : `saveSaleArticle` et les imports d'articles (une fiche peut légitimement référencer un produit désactivé — décision T9) ; `recordInventory` (on inventorie ce qui existe physiquement) ; `deliverOrder`/`receiveOrder` (la commande a été validée à la création ; bloquer la réception d'une commande en cours créerait un stock fantôme).

## 5. Fraîcheur des sessions

- `requireRole(roles)` (src/lib/session.ts) recharge l'utilisateur en base après la vérification JWT : utilisateur introuvable, `active = false`, ou `role` en base ≠ rôle exigé (avec passe-droit admin conservé) → `redirect('/login')`.
- Le rôle utilisé pour la décision est CELUI DE LA BASE (le jeton ne sert plus que d'identifiant authentifié). Un admin rétrogradé perd l'accès admin à la requête suivante ; un compte désactivé est déconnecté partout.
- `getSession()` reste purement JWT (affichage TopBar, etc.) ; le proxy Edge reste inchangé (pré-filtre rapide par jeton ; la garde qui fait foi est requireRole, présente sur toutes les pages protégées et actions).
- Coût : une requête Neon par page/action protégée — accepté (décision utilisateur).

## 6. Typage `AnyDb`

- `src/db/index.ts` : `export type AnyDb = NeonHttpDatabase<typeof schema> | PgliteDatabase<typeof schema>` (imports `type` depuis drizzle-orm/neon-http et drizzle-orm/pglite ; disponibles à la compilation, effacés à l'exécution).
- Aucun changement d'API des libs. Si `tsc` révèle des usages incompatibles, on corrige le typage des libs concernées (pas de `as any` de contournement, sauf impossibilité documentée en commentaire).

## 7. Export de la page Mouvements (CSV + Excel)

- **Lib** : `getMovementReport` enrichie de `receptionsValue`, `sortiesValue`, `ajustementsValue` (Math.round(qté × prix d'achat), ajustementsValue signé) — champs AJOUTÉS à `MovementReportLine`, rien de retiré.
- **Nouvelle fonction** `buildMovementExport(sections, { format, from, to })` dans `src/lib/movement-export.ts` — `sections: Array<{ locationName: string; lines: MovementReportLine[] }>` → `{ buffer, filename, contentType }` :
  - Colonnes : Produit · Unité · Stock initial · Réceptions · Sorties · Ajustements · Stock final · Valeur initiale (FCFA) · Valeur réceptions (FCFA) · Valeur sorties (FCFA) · Valeur ajustements (FCFA) · Valeur finale (FCFA).
  - CSV : BOM UTF-8, séparateur `;`, virgule décimale française pour les quantités (cohérent templates). xlsx : une feuille par emplacement exporté (nom = emplacement).
  - Nom de fichier : `mouvements-<du>-<au>.csv|xlsx`.
- **Route** GET `/compta/mouvements/export` : session comptable revérifiée (403 sinon), mêmes paramètres et mêmes règles de filtres que la page (défauts, produit>article, emplacement inconnu → tous) ; « tous les emplacements » → CSV : sections empilées avec une ligne d'emplacement, xlsx : une feuille par emplacement.
- **Page** : sous le formulaire de filtres, ligne « Exporter : CSV · Excel » (liens reprenant les filtres courants, comme les liens détail).

## 8. Outillage

- `tests/unit/import-table.test.ts` : suppression du helper `xlsxBuf` inutilisé (SEULE retouche d'un test existant de la phase, cosmétique, supprime le dernier warning lint).
- `eslint.config.mjs` : ajout de `.claude/**` aux ignores → `npm run lint` redevient le point d'entrée standard (les balayages `npx eslint src tests` restent équivalents).

## 9. Tests (TDD, nouveaux sauf mention)

1. parseTable : en-tête vide au milieu rejeté avec position ; en-têtes dupliqués rejetés ; cellules vides en fin de ligne toujours tolérées.
2. Plafond : fichier > 4 Mo rejeté par les actions (test lib/action au niveau approprié).
3. Gardes active : createOrder, recordServiceExit, recordAdjustment refusent un produit désactivé (message avec le nom) ; produit actif passe.
4. requireRole : compte désactivé → redirection ; rôle rétrogradé en base → redirection malgré un jeton encore « admin » ; rôle valide → passe. (Tests d'intégration avec db de test + session simulée — même approche que les tests d'actions existants si elle existe, sinon test de la logique extraite.)
5. Valorisation mouvements : receptionsValue/sortiesValue/ajustementsValue corrects (signés pour ajustements).
6. buildMovementExport : CSV avec BOM + en-têtes français + virgule décimale ; xlsx relisible (feuille par emplacement).

Suite attendue : 154 → ~168-170. Aucun test existant modifié hors la suppression du helper (point 8).

## 10. Conventions

Branche `feature/durcissement-post-v1`. Règles habituelles : requireRole en tête, FormError, type="submit" explicite, messages français, LOGIQUE INTOUCHABLE hors modifications listées ici (parseTable §2, actions upload §3, 3 libs §4, session.ts §5, db/index.ts §6, movement-report.ts §7, test §8, eslint §8).

## 11. Hors périmètre

Suivi du stock magasin (n° 9) ; rate-limiting ; audit des sessions actives ; export des autres pages.
