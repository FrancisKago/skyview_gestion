# Skyview — Gestion de stock Restaurant-Bar

Application de traçabilité des mouvements de stock pour un restaurant-bar : commandes au magasin, livraisons, réceptions avec écarts, sorties de fin de service et inventaires hebdomadaires. Elle permet d'importer les ventes caisse (CSV/Excel) et de produire un rapprochement valorisé en FCFA entre le stock théorique et les ventes réellement enregistrées. Le comptable dispose aussi d'une page `/compta/mouvements` qui présente, par période, le stock initial, le détail des mouvements et le stock final, avec filtres par produit, article ou emplacement. Cinq rôles (admin, magasinier, barman, cuisinier, comptable) disposent chacun d'un accès dédié à leurs écrans. L'interface est conçue mobile-first pour être utilisée directement sur smartphone en salle, au bar ou en cuisine.

## Prérequis

- Node.js 18+ (recommandé : 20+)
- Un compte [Neon](https://neon.tech) (ou toute base Postgres accessible)
- Un compte [Vercel](https://vercel.com) pour le déploiement

## Installation locale

```bash
npm install
cp .env.example .env.local
# renseigner DATABASE_URL et SESSION_SECRET dans .env.local
npm run db:migrate
ADMIN_PASSWORD=<mot-de-passe-fort> npm run db:seed
npm run dev
```

`db:migrate` et `db:seed` lisent automatiquement `.env.local` (DATABASE_URL, SESSION_SECRET). Seul `ADMIN_PASSWORD` reste à préfixer explicitement sur la commande `db:seed` : c'est un secret à usage unique (le mot de passe initial de l'admin), il n'est pas destiné à être stocké dans `.env.local`.

L'application est alors disponible sur [http://localhost:3000](http://localhost:3000). Le compte admin créé par le seed permet ensuite de créer les autres comptes (magasinier, barman, cuisinier, comptable) depuis l'écran Utilisateurs.

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Démarre le serveur de développement |
| `npm run build` | Construit l'application pour la production |
| `npm test` | Lance la suite de tests (Vitest) |
| `npm run test:watch` | Lance les tests en mode watch |
| `npm run lint` | Vérifie le code avec ESLint |
| `npm run db:generate` | Génère les migrations Drizzle à partir du schéma |
| `npm run db:migrate` | Applique les migrations sur la base configurée |
| `npm run db:seed` | Crée le compte admin initial (nécessite `ADMIN_PASSWORD`) |

## Tests

```bash
npm test
```

Les tests utilisent Vitest et une base Postgres en mémoire (PGlite) : aucun serveur Postgres n'est nécessaire pour les exécuter.

## Déploiement Vercel

```bash
npm i -g vercel
vercel link
```

1. Dashboard Vercel → Marketplace → Neon → créer la base (la variable `DATABASE_URL` est injectée automatiquement).
2. Settings → Environment Variables → ajouter `SESSION_SECRET` (32+ caractères aléatoires).
3. Récupérer les variables en local puis appliquer les migrations :

   ```bash
   vercel env pull .env.local
   npm run db:migrate
   ```

4. Créer le compte admin initial :

   ```bash
   ADMIN_PASSWORD=<mot-de-passe-fort> npm run db:seed
   ```

5. Déployer en production :

   ```bash
   vercel --prod
   ```

## Recette manuelle (journée type)

À jouer sur smartphone, sur l'URL de production, avec les comptes créés par l'admin :

1. Admin : créer 3 produits (Castel casier×12, Poulet kg, Whisky L), 3 articles de vente avec fiches (« Castel 65cl » = 1 bouteille ; « Poulet DG » = 0.4 kg ; « Whisky (verre) » = 0.04 L), 1 compte par rôle.
2. Barman : commander 3 casiers de Castel.
3. Magasinier : livrer 2 casiers + 5 bouteilles (écart).
4. Barman : confirmer 28 reçues (nouvel écart) → stock = 28.
5. Barman : saisir sorties du service : 24 Castel.
6. Comptable : uploader un CSV `Article;Quantité` avec `Castel 65cl;24` → rapprochement : écart 0. Refaire avec 26 vendues → écart −2 (−1 300 FCFA) affiché en rouge.
7. Barman : inventaire — compter 3 (au lieu de 4 théorique) → écart −1 tracé, stock ajusté.
8. Vérifier le tableau de bord comptable : valeurs, alertes, dernier inventaire.
9. Vérifier les permissions : URL `/admin/produits` en tant que barman → redirigé.

## Documentation

La spécification complète du projet se trouve dans [docs/superpowers/specs/2026-07-11-gestion-stock-design.md](docs/superpowers/specs/2026-07-11-gestion-stock-design.md).

## Comptes & rôles

Le seed initial (`npm run db:seed`) ne crée qu'un compte administrateur, avec le mot de passe fourni via `ADMIN_PASSWORD`. Toutes les autres personnes (magasinier, barman, cuisinier, comptable) sont ensuite créées par l'admin depuis l'écran Utilisateurs de l'application — il n'y a pas d'inscription libre. L'admin peut ensuite modifier ces comptes (nom, rôle, mot de passe), éditer les produits, articles et fiches techniques, et initialiser le catalogue en masse depuis la page `/admin/imports` (modèles CSV/Excel à télécharger + import en masse de produits et d'articles).
