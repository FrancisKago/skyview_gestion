# Spécification — Gestion de stock Restaurant-Bar (Skyview)

**Date** : 11 juillet 2026
**Statut** : validé en brainstorming, en attente de revue finale utilisateur

## 1. Problème et objectif

Le restaurant-bar est alimenté par un magasin central qui possède son propre système de gestion. La caisse a son propre logiciel. Entre les deux, **les mouvements de stock du bar et de la cuisine ne sont pas tracés** : livraisons du magasin, réceptions, sorties de fin de service.

L'application doit permettre :
- au **magasinier** de saisir les produits livrés par emplacement ;
- au **barman** et au **cuisinier** de passer commande, confirmer les réceptions, et saisir les sorties de leur stock en fin de service ;
- au **comptable** de vérifier la cohérence des sorties en uploadant les quantités vendues à la caisse (export Excel/CSV) pour les comparer aux sorties déclarées ;
- à tous de connaître **le stock en un coup d'œil**, valorisé en FCFA.

## 2. Périmètre v1

### Inclus
- 3 emplacements : **Magasin** (source des livraisons uniquement), **Bar**, **Cuisine**
- Circuit commande → livraison → confirmation de réception (double validation, écarts tracés)
- Sorties de fin de service par emplacement
- Fiches techniques (recettes) reliant les articles vendus en caisse aux produits du stock
- Import Excel/CSV des ventes caisse + rapport de rapprochement (théorique vs déclaré)
- Conditionnements d'achat avec conversion automatique en unité de base
- Inventaire hebdomadaire par emplacement, écarts historisés et valorisés
- Tableau de bord : stock temps réel par emplacement, valeur en FCFA, alertes seuil bas
- 5 rôles avec comptes individuels (2-3 personnes par rôle)
- Interface **mobile-first** (smartphones), utilisable aussi sur PC
- Quantités **et** valorisation (prix d'achat en FCFA)

### Exclus (v1)
- Suivi du stock interne du magasin (déjà couvert par son propre système)
- Gestion des fournisseurs et des achats du magasin
- Intégration API directe avec le logiciel de caisse (l'import fichier suffit)
- Gestion automatique des reliquats de commandes partiellement livrées
- Mode hors-ligne

## 3. Rôles et permissions

| Rôle | Capacités |
|---|---|
| **Admin** | Produits, conditionnements, articles de vente et fiches techniques, comptes utilisateurs, mouvements d'ajustement (motif obligatoire), accès à tous les écrans |
| **Magasinier** | Voir les commandes en attente, saisir les livraisons, historique de ses livraisons |
| **Barman** | Stock du bar, commandes vers le magasin, confirmation de réception, sorties de fin de service, inventaire du bar |
| **Cuisinier** | Identique au barman, pour la cuisine |
| **Comptable** | Tableau de bord global valorisé, upload des ventes caisse, rapports de rapprochement, historique des inventaires et écarts |

Chaque personne a son propre compte (identifiant + mot de passe, créé par l'admin). Toute écriture est horodatée avec son auteur. Les permissions sont vérifiées côté serveur.

## 4. Architecture technique

- **Application Next.js (App Router)** : interface mobile-first et API dans le même projet
- **Base Postgres cloud** (Neon via le marketplace Vercel)
- **Hébergement Vercel** : HTTPS automatique, accessible depuis les smartphones
- **Authentification** : identifiant + mot de passe, sessions sécurisées, mots de passe hachés

Choix retenu contre : (a) Supabase + front séparé — la logique métier (workflow, conversions, rapprochement) serait moins bien structurée ; (b) back-end classique sur VPS — plus lourd à construire et administrer pour une mini-application.

## 5. Modèle de données

### Référentiel (géré par l'admin)
- **Utilisateur** : nom, identifiant, mot de passe haché, rôle, actif
- **Emplacement** : Magasin, Bar, Cuisine
- **Produit** : nom, catégorie, unité de base (bouteille, kg, L…), conditionnement d'achat optionnel (nom + taille, ex. « casier » = 12), prix d'achat unitaire (FCFA), seuil d'alerte (comparé au stock de chaque emplacement séparément), actif
- **Article de vente** : nom tel qu'exporté par la caisse, emplacement concerné (bar/cuisine), fiche technique = liste de lignes (produit, quantité en unité de base). Exemples : « Poulet DG » = 0,4 kg poulet + 0,2 kg plantain ; « Whisky (verre) » = 0,04 L de la bouteille ; « Castel 65cl » = 1 bouteille

### Flux quotidiens
- **Commande** : emplacement demandeur, créée par, date, statut (`en_attente` → `livrée` → `réceptionnée`), lignes (produit, qté demandée, qté livrée, qté reçue)
- **Sortie de service** : emplacement, date de service (modifiable pour les services passant minuit), saisie par, lignes (produit, quantité)
- **Mouvement de stock** (journal immuable) : produit, emplacement, type (`réception`, `sortie_service`, `ajustement_inventaire`, `ajustement_admin`), quantité signée, référence au document d'origine, auteur, horodatage. **Le stock actuel d'un emplacement est calculé à partir de ce journal.**

### Contrôle
- **Inventaire** : emplacement, date, compté par, statut, lignes (produit, qté théorique, qté comptée, écart, valeur de l'écart) ; la validation crée les mouvements d'ajustement
- **Import de ventes** : fichier, période, uploadé par, lignes (article caisse, quantité vendue) ; lignes non reconnues mises en attente de correspondance
- **Rapprochement** : par produit, sur la période couverte par le fichier importé (typiquement une journée de service) — consommation théorique (ventes × fiches techniques) vs sorties déclarées, écart en quantité et en FCFA

## 6. Règles métier et cas particuliers

1. **Stock magasin non suivi** : l'application trace ce qui sort du magasin vers bar/cuisine, pas son stock interne (pas de double saisie avec son système existant).
2. **Mise à jour du stock à la confirmation** : le stock d'un emplacement n'augmente qu'à la **confirmation de réception** par le barman/cuisinier, pas à la saisie de livraison. Les écarts livré/reçu sont tracés.
3. **Immuabilité** : une sortie ou réception validée ne se modifie pas. Correction = mouvement d'ajustement par l'admin, motif obligatoire, les deux écritures restent visibles.
4. **Conversion automatique** : le magasinier saisit en conditionnements (« 3 casiers ») ou en unités ; tout est stocké en unité de base.
5. **Article caisse inconnu** : l'import n'échoue pas ; les lignes non reconnues sont mises en attente de correspondance, la correspondance est mémorisée pour les imports suivants.
6. **Stock négatif autorisé avec alerte** : la saisie n'est jamais bloquée, l'anomalie est signalée au tableau de bord ; l'inventaire hebdomadaire corrige.
7. **Livraison partielle** : l'écart demandé/livré reste visible ; pas de reliquat automatique — nouvelle commande si besoin.

## 7. Écrans

- **Connexion** (tous)
- **Magasinier** : commandes en attente · saisie de livraison · historique
- **Barman/Cuisinier** : stock de mon emplacement · nouvelle commande · réceptions à confirmer · sorties de fin de service · inventaire
- **Comptable** : tableau de bord valorisé · upload ventes caisse · rapport de rapprochement · historique inventaires/écarts
- **Admin** : produits · articles de vente et fiches techniques · utilisateurs · ajustements

Interface mobile-first : gros boutons, saisie rapide, produits fréquents en premier dans les listes de saisie.

## 8. Gestion des erreurs

- Validations côté serveur sur toutes les écritures (quantités positives, produits actifs, rôle autorisé)
- Import de fichier : rapport d'import détaillé (lignes acceptées, rejetées, en attente de correspondance) ; aucune écriture partielle silencieuse
- Double soumission : protection par jeton d'idempotence sur les validations
- Toute erreur affichée en français clair, actionnable par l'utilisateur

## 9. Stratégie de test

1. **Tests unitaires (TDD)** sur la logique critique : conversions d'unités, calcul de stock depuis le journal, consommation théorique, rapprochement et valorisation, écarts d'inventaire.
2. **Tests d'intégration** : circuit commande → livraison → réception (avec écarts), import CSV/Excel réel (dont articles inconnus), contrôle des permissions par rôle.
3. **Recette manuelle** avant mise en service : scénario complet d'une journée jouée sur smartphone, avec un vrai export de la caisse.

## 10. Critères de succès

- Le magasinier, le barman et le cuisinier font leurs saisies quotidiennes depuis leur téléphone sans formation lourde.
- Le stock affiché correspond à la réalité (écarts d'inventaire faibles et expliqués).
- Le comptable produit un rapport de rapprochement en quelques minutes après upload du fichier caisse, avec les écarts valorisés en FCFA.
- Chaque mouvement de stock a un auteur et un horodatage — plus aucun mouvement non tracé.
