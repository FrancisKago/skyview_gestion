# Spécification — Refonte design « Skyview Lounge » + améliorations UX

**Date** : 12 juillet 2026
**Statut** : validé en brainstorming, en attente de revue finale utilisateur
**Référence** : logo Skyview Lounge (fond noir, lettrage blanc élégant, verre à cocktail rouge formant le V)

## 1. Problème et objectif

L'interface v1 est fonctionnelle mais générique : cartes blanches sur fond gris, accent indigo, emojis, aucune identité. Objectif : donner à l'application l'identité du restaurant-bar Skyview Lounge (chaleur hospitality + lisibilité terrain), et corriger au passage quelques irritants d'ergonomie de saisie quotidienne — **sans toucher à la logique métier validée** (87 tests).

## 2. Périmètre

### Inclus
- Refonte visuelle complète de tous les écrans (thème **sombre uniquement**)
- Design tokens + bibliothèque de composants réutilisables
- Typographie de marque et icônes vectorielles (fin des emojis)
- 5 améliorations UX ciblées (voir §6)

### Exclus
- Thème clair (porte ouverte pour plus tard : les tokens le permettront)
- Refonte des parcours/navigation (structure des écrans inchangée)
- Toute modification des server actions et libs métier, à l'exception de `getFrequentProducts` (§6.2)

## 3. Direction visuelle

**Personnalité** : lounge chaleureux + terrain ultra-lisible. Le rouge cocktail du logo est **réservé aux actions** ; l'ambre doré porte **l'argent** ; les états sémantiques ne se confondent jamais avec la marque.

### Palette (tokens)
| Token | Valeur | Usage |
|---|---|---|
| `--color-night` | `#0B0B0D` | Fond de page |
| `--color-card` | `#1A1A1F` | Cartes, champs |
| `--color-surface` | `#232329` | Surfaces élevées, dégradés de cartes |
| `--color-border` | `#2E2E36` | Bordures 1px (remplacent les ombres) |
| `--color-action` | `#C8102E` | Boutons primaires, nav active, focus (hover `#E4193B`) |
| `--color-money` | `#E8B23A` | Toutes les valeurs FCFA |
| `--color-negative` | `#FF6B6B` | Écarts négatifs, stock négatif (distinct du rouge d'action) |
| `--color-success` | `#4ADE80` | Conformité, confirmations |
| `--color-warning` | `#FBBF24` | Seuils bas, correspondances en attente |
| `--color-text` | `#F5F2EC` | Texte principal (blanc chaud) |
| `--color-text-muted` | `#A8A29E` | Texte secondaire |

### Typographie
- **Playfair Display** (via `next/font/google`) : titres de pages, marque « Sky**v**iew » (v en rouge)
- **Inter** (via `next/font/google`) : interface ; `font-variant-numeric: tabular-nums` sur les quantités et montants
- Remplace Geist.

### Formes & interaction
- Rayons : 12px (cartes), 10px (contrôles) ; bordures subtiles plutôt qu'ombres
- Cibles tactiles ≥ 48px ; focus visible (anneau rouge) ; contrastes AA minimum sur fond sombre
- Icônes : **lucide-react**, trait fin, remplacent tous les emojis (nav, listes, états)

## 4. Bibliothèque de composants (`src/components/ui/`)

| Composant | Rôle |
|---|---|
| `PageHeader` | Titre Playfair + sous-titre optionnel |
| `StatCard` | Libellé uppercase + grande valeur ambre (totaux FCFA) |
| `Card` / `ListRow` | Conteneurs charbon, variantes d'alerte (liseré ambre/rouge clair) |
| `Button` | Primaire (rouge), secondaire (fantôme), état pending intégré, ≥ 48px |
| `Input` / `Select` / `DateField` | Fond `#1A1A1F`, focus rouge, dimensionnés mobile |
| `Badge` | seuil bas (ambre) · négatif (rouge clair) · OK (vert) · statuts de commande |
| `SearchBox` | Filtre client-side des listes de produits |
| `EmptyState` | Icône + message + action suggérée |
| `TopBar` / `BottomNav` | Marque, utilisateur·emplacement, icônes lucide, actif rouge |

Chaque composant : un fichier, une responsabilité, props typées ; les pages ne contiennent plus de classes Tailwind « brutes » répétées pour ces motifs.

## 5. En-tête et navigation

- **TopBar** : « Sky**v**iew » en Playfair (v rouge) à gauche ; à droite `Prénom · Emplacement` avec menu déconnexion.
- **BottomNav** : inchangée dans sa structure par rôle, icônes lucide (Stock 📈→chart, Commandes→cart, Réceptions→download, Sorties→calendar, Inventaire→clipboard, etc.), élément actif rouge + libellé gras.

## 6. Améliorations UX ciblées

1. **SearchBox produits** — filtre instantané côté client en tête des listes : saisie des sorties, nouvelle commande, inventaire, admin produits. Insensible à la casse et aux accents.
2. **Produits fréquents en premier** — dans sorties et commandes, les listes de produits sont triées par fréquence d'utilisation à l'emplacement courant sur les 30 derniers jours (nombre de mouvements `sortie_service` + lignes de commandes), puis alphabétique. Nouvelle fonction `getFrequentProducts(db, locationId)` dans `src/lib/` — **TDD obligatoire** (seul point touchant la logique).
3. **Groupes par catégorie** — les `<select>` de produits utilisent `<optgroup>` par catégorie (champ existant `products.category` ; « Autres » si vide). S'applique après le tri fréquence (fréquents en premier groupe, puis catégories).
4. **Labels français des mouvements** — mapping d'affichage : `reception` → « Réception », `sortie_service` → « Sortie de service », `ajustement_inventaire` → « Ajustement inventaire », `ajustement_admin` → « Ajustement admin ». Constante partagée `MOVEMENT_LABELS` utilisée par le journal admin (et disponible pour tout écran futur).
5. **EmptyStates** — remplacer chaque « Aucun … » texte par le composant EmptyState avec action suggérée quand elle existe (ex. « Rien à réceptionner » → lien vers Commandes).

## 7. Écrans concernés (ré-habillage, logique inchangée)

login · layout (TopBar/BottomNav/error.tsx) · stock · sorties · commandes · réceptions (+détail) · livraisons (+détail) · inventaire · compta (tableau de bord, imports, rapprochements) · admin (produits, articles, utilisateurs, ajustements).

Détails notables :
- **Rapprochements** : tableau avec lignes d'écart en fond rouge-clair translucide, total en StatCard ambre ; sélecteur d'imports en pastilles.
- **Tableau de bord compta** : StatCards par emplacement, alertes en ListRow à liseré.
- **Login** : plein écran nuit, marque Playfair centrée, formulaire épuré.

## 8. Contraintes techniques

- Tailwind v4 : tokens via `@theme` dans `globals.css` ; suppression du bloc `prefers-color-scheme` clair.
- Polices via `next/font/google` (Playfair Display 600/700, Inter variable) — pas de CDN externe.
- `lucide-react` : seule dépendance ajoutée (tree-shakée par import nommé).
- Aucune modification de `src/lib/*` existants, des server actions, du schéma DB ni des migrations — à l'exception de l'ajout `getFrequentProducts` (nouveau fichier) et `MOVEMENT_LABELS` (nouveau fichier de constantes UI).
- Mobile-first inchangé ; le comptable/admin sur PC bénéficie de `max-w` adaptés déjà en place.

## 9. Gestion des erreurs & états

- Messages d'erreur des formulaires : ListRow rouge-clair avec icône (au lieu du texte rouge nu) ; avertissements (stock négatif) en ambre.
- États pending : intégrés au Button (spinner + libellé « … en cours »), plus de bouton qui « meurt » silencieusement.
- `error.tsx` global relooké aux couleurs du thème.

## 10. Stratégie de test et de vérification

1. **TDD** sur `getFrequentProducts` (tri par fréquence 30 jours, filtre emplacement, fallback alphabétique) et sur le helper de filtre insensible aux accents de SearchBox (fonction pure).
2. **Les 87 tests existants restent verts sans modification** — garde-fou principal : la logique n'a pas bougé.
3. **Vérification visuelle** écran par écran dans l'aperçu local (dev server) au fil de la migration ; `npm run build` + lint à chaque étape.
4. Contraste : vérification AA des combinaisons de tokens (texte/fond) une fois pour toutes dans la spec des tokens.

## 11. Critères de succès

- L'application est reconnaissable Skyview Lounge dès l'écran de connexion.
- Les montants FCFA se repèrent instantanément (ambre) ; les alertes sont impossibles à manquer, y compris en luminosité difficile.
- Trouver un produit dans une liste de 100+ prend moins de 3 secondes (recherche + fréquents en premier).
- Aucune régression : 87 tests verts, mêmes parcours, mêmes URLs.

---
**Amendement (12/07/2026, revue finale)** : l'exclusion « ni du schéma DB ni des migrations » (§8) est levée pour un unique ajout de performance : l'index `orders_location_created_idx` sur `orders(location_id, created_at)` (migration 0004), nécessaire à `getFrequentProducts` appelée à chaque affichage des écrans de saisie.
