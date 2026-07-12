# Plan d'implémentation — Refonte design « Skyview Lounge » + UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habiller toute l'application aux couleurs Skyview Lounge (thème sombre unique, rouge cocktail, ambre FCFA) via une bibliothèque de composants, et livrer 5 améliorations UX ciblées — sans toucher à la logique métier (les 87 tests existants restent verts tels quels).

**Architecture:** Design tokens Tailwind v4 (`@theme` dans globals.css) + polices `next/font` (Playfair Display, Inter) + bibliothèque `src/components/ui/` (composants typés, une responsabilité chacun). Les écrans sont ré-habillés un par un en remplaçant les classes brutes par les composants. Trois nouveaux modules purs/testés portent l'UX : `normalizeText` (recherche sans accents), `groupProducts` (fréquents + catégories), `getFrequentProducts` (fréquence 30 jours), plus la constante `MOVEMENT_LABELS`.

**Tech Stack:** Tailwind v4, next/font/google (Playfair Display + Inter), lucide-react (seule dépendance ajoutée), Vitest/PGlite pour les nouveaux helpers.

**Spec de référence :** `docs/superpowers/specs/2026-07-12-design-ui-lounge.md`

---

## Structure des fichiers

```
src/
  app/globals.css            # MODIFIÉ : tokens @theme, suppression thème clair
  app/layout.tsx             # MODIFIÉ : next/font Playfair + Inter
  app/login/page.tsx         # MODIFIÉ : habillage nuit
  app/error.tsx              # MODIFIÉ : habillage nuit
  app/(protected)/layout.tsx # MODIFIÉ : TopBar + BottomNav
  app/(protected)/**/*.tsx   # MODIFIÉS : ré-habillage écran par écran
  components/ui/
    button.tsx  badge.tsx  card.tsx  page-header.tsx  stat-card.tsx
    fields.tsx  search-box.tsx  empty-state.tsx
    top-bar.tsx  bottom-nav.tsx
  lib/
    text.ts                  # normalizeText (pur)
    movement-labels.ts       # MOVEMENT_LABELS (const)
    product-grouping.ts      # groupProducts (pur)
    frequent-products.ts     # getFrequentProducts (db)
tests/unit/   text.test.ts  product-grouping.test.ts
tests/integration/ frequent-products.test.ts
```

**Conventions transverses :**
- Nommage des tokens : identiques à la spec en VALEURS ; deux noms adaptés pour l'ergonomie des classes Tailwind : `--color-border` → `--color-line` (classe `border-line`), `--color-text`/`--color-text-muted` → `--color-cream`/`--color-muted` (classes `text-cream`, `text-muted`).
- AUCUNE modification des server actions ni des libs existantes. Interdit de toucher à `src/lib/{orders,products,stock,...}.ts` existants.
- Chaque tâche d'écran se termine par : `npm test` (87+ verts), `npx tsc --noEmit`, `npm run build`, et une vérification visuelle dans l'aperçu (dev server) de l'écran concerné.
- Commits fréquents `feat:`/`refactor:`.

---

### Task 1: Fondations — tokens, polices, lucide, login

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/error.tsx`
- Deps: `npm install lucide-react`

- [ ] **Step 1: Installer lucide-react**

```bash
npm install lucide-react
```

- [ ] **Step 2: Remplacer `src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  /* Palette Skyview Lounge (spec §3) */
  --color-night: #0b0b0d;
  --color-card: #1a1a1f;
  --color-surface: #232329;
  --color-line: #2e2e36;
  --color-action: #c8102e;
  --color-action-hover: #e4193b;
  --color-money: #e8b23a;
  --color-negative: #ff6b6b;
  --color-success: #4ade80;
  --color-warning: #fbbf24;
  --color-cream: #f5f2ec;
  --color-muted: #a8a29e;

  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-playfair), Georgia, serif;

  --radius-card: 12px;
  --radius-control: 10px;
}

body {
  background: var(--color-night);
  color: var(--color-cream);
  font-family: var(--font-sans);
}

/* Quantités et montants alignés */
.tnum { font-variant-numeric: tabular-nums; }
```

(Le bloc `prefers-color-scheme` clair et les variables Geist disparaissent — thème sombre unique, spec §2.)

- [ ] **Step 3: Polices dans `src/app/layout.tsx`**

Remplacer les imports/usages Geist par :

```tsx
import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({
  subsets: ['latin'], weight: ['600', '700'], variable: '--font-playfair',
});

export const metadata: Metadata = {
  title: 'Skyview — Gestion de stock',
  description: "Gestion de stock du restaurant-bar Skyview Lounge : commandes, livraisons, sorties, inventaires et rapprochement caisse.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${playfair.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Login aux couleurs de la marque — `src/app/login/page.tsx`**

```tsx
'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-night">
      <form action={action}
        className="w-full max-w-sm bg-card border border-line rounded-(--radius-card) p-8 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="font-display text-3xl font-bold text-cream">
            Sky<span className="text-action">v</span>iew
          </h1>
          <p className="text-muted text-sm italic">Lounge — Gestion de stock</p>
        </div>
        <input name="username" placeholder="Identifiant" autoComplete="username" required
          className="w-full bg-night border border-line rounded-(--radius-control) p-3.5 text-lg text-cream placeholder:text-muted focus:outline-2 focus:outline-action" />
        <input name="password" type="password" placeholder="Mot de passe" autoComplete="current-password" required
          className="w-full bg-night border border-line rounded-(--radius-control) p-3.5 text-lg text-cream placeholder:text-muted focus:outline-2 focus:outline-action" />
        {state.error && <p className="text-negative text-sm">{state.error}</p>}
        <button disabled={pending}
          className="w-full min-h-12 bg-action hover:bg-action-hover text-white rounded-(--radius-control) p-3 text-lg font-semibold disabled:opacity-50 transition-colors">
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: `src/app/error.tsx` aux couleurs du thème**

```tsx
'use client';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  void error;
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-night">
      <div className="w-full max-w-sm bg-card border border-line rounded-(--radius-card) p-6 space-y-4 text-center">
        <h1 className="font-display text-xl font-bold text-cream">Accès refusé ou erreur inattendue</h1>
        <p className="text-muted text-sm">Reconnectez-vous ou contactez l&apos;administrateur.</p>
        <button onClick={() => { window.location.href = '/login'; }}
          className="w-full min-h-12 bg-action hover:bg-action-hover text-white rounded-(--radius-control) p-3 font-semibold transition-colors">
          Retour à la connexion
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Vérifier**

Run: `npm test` → 87 verts · `npx tsc --noEmit` → propre · `npm run build` → OK.
Vérif visuelle : /login affiche la marque Playfair sur fond nuit. Note : la syntaxe `rounded-(--radius-card)` est Tailwind v4 ; si elle ne compile pas dans la version installée, utiliser `rounded-xl`/`rounded-[10px]` littéraux — noter l'adaptation.

- [ ] **Step 7: Commit**

```bash
git add src/app/ package.json package-lock.json
git commit -m "feat(ui): tokens Skyview Lounge, polices Playfair/Inter, login nuit"
```

### Task 2: Helpers purs (TDD) — normalizeText, MOVEMENT_LABELS, groupProducts

**Files:**
- Create: `src/lib/text.ts`, `src/lib/movement-labels.ts`, `src/lib/product-grouping.ts`
- Test: `tests/unit/text.test.ts`, `tests/unit/product-grouping.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/unit/text.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeText, matchesQuery } from '@/lib/text';

describe('normalizeText', () => {
  it('minuscule, sans accents, sans espaces superflus', () => {
    expect(normalizeText('  Bière Pression ')).toBe('biere pression');
    expect(normalizeText('CASTEL 65cl')).toBe('castel 65cl');
  });
});
describe('matchesQuery', () => {
  it('trouve sans tenir compte de la casse ni des accents', () => {
    expect(matchesQuery('Bière Castel 65cl', 'biere')).toBe(true);
    expect(matchesQuery('Poulet DG', 'dg')).toBe(true);
    expect(matchesQuery('Whisky', 'rhum')).toBe(false);
    expect(matchesQuery('Whisky', '')).toBe(true); // requête vide = tout passe
  });
});
```

```ts
// tests/unit/product-grouping.test.ts
import { describe, it, expect } from 'vitest';
import { groupProducts } from '@/lib/product-grouping';

const P = (id: number, name: string, category = '') => ({ id, name, category });

describe('groupProducts', () => {
  it('met les fréquents en premier (tri par fréquence puis nom), puis groupe par catégorie', () => {
    const products = [P(1, 'Castel', 'Bières'), P(2, 'Guinness', 'Bières'), P(3, 'Riz', 'Vivres'), P(4, 'Whisky')];
    const freq = new Map([[2, 10], [1, 10], [3, 2]]);
    const groups = groupProducts(products, freq);
    expect(groups[0].label).toBe('★ Fréquents');
    expect(groups[0].products.map((p) => p.name)).toEqual(['Castel', 'Guinness', 'Riz']); // 10/10 → alphabétique, puis 2
    expect(groups.slice(1).map((g) => g.label)).toEqual(['Autres']); // catégorie vide → Autres
    expect(groups[1].products.map((p) => p.name)).toEqual(['Whisky']);
  });
  it('sans fréquence : uniquement les groupes de catégories, triés', () => {
    const groups = groupProducts([P(1, 'Riz', 'Vivres'), P(2, 'Castel', 'Bières')], new Map());
    expect(groups.map((g) => g.label)).toEqual(['Bières', 'Vivres']);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/unit/text.test.ts tests/unit/product-grouping.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/text.ts
// Normalisation pour la recherche : minuscules, accents retirés, bornes nettoyées.
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  return normalizeText(text).includes(q);
}
```

```ts
// src/lib/movement-labels.ts
// Libellés français des types de mouvements (journal admin, spec §6.4).
export const MOVEMENT_LABELS: Record<string, string> = {
  reception: 'Réception',
  sortie_service: 'Sortie de service',
  ajustement_inventaire: 'Ajustement inventaire',
  ajustement_admin: 'Ajustement admin',
};
```

```ts
// src/lib/product-grouping.ts
export interface GroupableProduct { id: number; name: string; category: string }
export interface ProductGroup<T> { label: string; products: T[] }

// Fréquents (freq > 0) en tête, tri fréquence desc puis nom ; le reste par catégorie
// alphabétique ('Autres' si vide). Spec §6.2-6.3.
export function groupProducts<T extends GroupableProduct>(
  products: T[], freq: Map<number, number>,
): Array<ProductGroup<T>> {
  const frequents = products
    .filter((p) => (freq.get(p.id) ?? 0) > 0)
    .sort((a, b) => (freq.get(b.id)! - freq.get(a.id)!) || a.name.localeCompare(b.name, 'fr'));
  const rest = products.filter((p) => (freq.get(p.id) ?? 0) === 0);
  const byCat = new Map<string, T[]>();
  for (const p of rest) {
    const cat = p.category.trim() || 'Autres';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(p);
  }
  const groups = [...byCat.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .map(([label, ps]) => ({ label, products: ps.sort((a, b) => a.name.localeCompare(b.name, 'fr')) }));
  return [...(frequents.length ? [{ label: '★ Fréquents', products: frequents }] : []), ...groups];
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test` → tous verts (87 + 4 nouveaux)

- [ ] **Step 5: Commit**

```bash
git add src/lib/text.ts src/lib/movement-labels.ts src/lib/product-grouping.ts tests/unit/
git commit -m "feat(ux): normalisation recherche, labels mouvements, groupes produits (TDD)"
```

### Task 3: getFrequentProducts (TDD, intégration)

**Files:**
- Create: `src/lib/frequent-products.ts`
- Test: `tests/integration/frequent-products.test.ts`

- [ ] **Step 1: Test qui échoue**

```ts
// tests/integration/frequent-products.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder } from '@/lib/orders';
import { getFrequentProducts } from '@/lib/frequent-products';
import { stockMovements } from '@/db/schema';

describe('getFrequentProducts', () => {
  it("compte les sorties de service et les lignes de commandes des 30 derniers jours pour l'emplacement", async () => {
    const db = await createTestDb();
    const { bar, cuisine, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    // 2 sorties bar pour castel (createdAt = maintenant, dans la fenêtre)
    await db.insert(stockMovements).values([
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: '-2', userId: barman.id },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: '-1', userId: barman.id },
      // sortie CUISINE : ne compte pas pour le bar
      { productId: castel.id!, locationId: cuisine.id, type: 'sortie_service', qty: '-5', userId: barman.id },
      // réception : ne compte pas (seul sortie_service compte côté mouvements)
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: '10', userId: barman.id },
    ]);
    // 1 commande bar contenant riz
    await createOrder(db, { locationId: bar.id, createdBy: barman.id, lines: [{ productId: riz.id!, qtyRequested: 5 }] });

    const freq = await getFrequentProducts(db, bar.id);
    expect(freq.get(castel.id!)).toBe(2);
    expect(freq.get(riz.id!)).toBe(1);
  });
  it("mouvement vieux de plus de 30 jours : ignoré", async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Vieux', baseUnit: 'u', purchasePrice: 100 });
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    await db.insert(stockMovements).values({
      productId: p.id!, locationId: bar.id, type: 'sortie_service', qty: '-1', userId: barman.id, createdAt: old,
    });
    const freq = await getFrequentProducts(db, bar.id);
    expect(freq.get(p.id!)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/frequent-products.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/frequent-products.ts
import { and, eq, gte, sql } from 'drizzle-orm';
import { stockMovements, orders, orderLines } from '@/db/schema';
import type { AnyDb } from '@/db';

// Fréquence d'utilisation par produit à un emplacement sur 30 jours glissants :
// nombre de mouvements 'sortie_service' + nombre de lignes de commandes. Spec §6.2.
export async function getFrequentProducts(db: AnyDb, locationId: number): Promise<Map<number, number>> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const exits: Array<{ productId: number; n: string }> = await db.select({
    productId: stockMovements.productId, n: sql<string>`count(*)`,
  }).from(stockMovements)
    .where(and(
      eq(stockMovements.locationId, locationId),
      eq(stockMovements.type, 'sortie_service'),
      gte(stockMovements.createdAt, since),
    ))
    .groupBy(stockMovements.productId);
  const orderedLines: Array<{ productId: number; n: string }> = await db.select({
    productId: orderLines.productId, n: sql<string>`count(*)`,
  }).from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .where(and(eq(orders.locationId, locationId), gte(orders.createdAt, since)))
    .groupBy(orderLines.productId);
  const freq = new Map<number, number>();
  for (const r of [...exits, ...orderedLines]) {
    freq.set(r.productId, (freq.get(r.productId) ?? 0) + Number(r.n));
  }
  return freq;
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test` → tous verts

- [ ] **Step 5: Commit**

```bash
git add src/lib/frequent-products.ts tests/integration/frequent-products.test.ts
git commit -m "feat(ux): fréquence d'utilisation des produits sur 30 jours (TDD)"
```

### Task 4: Composants UI — lot 1 (Button, Badge, Card/ListRow, PageHeader, StatCard)

**Files:** Create `src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `page-header.tsx`, `stat-card.tsx`

Pas de tests unitaires sur ces composants purement présentatiels : la vérification est `tsc` + build + usage dans les tâches d'écrans (garde-fou : les 91 tests logiques).

- [ ] **Step 1: Button**

```tsx
// src/components/ui/button.tsx
'use client';
import { Loader2 } from 'lucide-react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  pending?: boolean;
};

export function Button({ variant = 'primary', pending, children, className = '', disabled, ...rest }: Props) {
  const base = 'min-h-12 rounded-[10px] px-5 font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-action';
  const look = variant === 'primary'
    ? 'bg-action hover:bg-action-hover text-white'
    : 'border border-line text-cream hover:bg-surface';
  return (
    <button disabled={disabled || pending} className={`${base} ${look} ${className}`} {...rest}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Badge**

```tsx
// src/components/ui/badge.tsx
type Tone = 'warning' | 'negative' | 'success' | 'neutral';
const TONES: Record<Tone, string> = {
  warning: 'bg-warning/15 text-warning border-warning/35',
  negative: 'bg-negative/15 text-negative border-negative/35',
  success: 'bg-success/15 text-success border-success/35',
  neutral: 'bg-surface text-muted border-line',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${TONES[tone]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Card & ListRow**

```tsx
// src/components/ui/card.tsx
type Tone = 'default' | 'warning' | 'negative';
const EDGES: Record<Tone, string> = {
  default: 'border-line',
  warning: 'border-warning/40',
  negative: 'border-negative/40',
};

export function Card({ tone = 'default', className = '', children }: {
  tone?: Tone; className?: string; children: React.ReactNode;
}) {
  return <div className={`bg-card border rounded-xl ${EDGES[tone]} ${className}`}>{children}</div>;
}

// Ligne de liste : padding standard + flex, dans une Card ou un <ul> stylé.
export function ListRow({ tone = 'default', className = '', children }: {
  tone?: Tone; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`bg-card border rounded-xl ${EDGES[tone]} p-3 flex items-center justify-between gap-3 ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: PageHeader & StatCard**

```tsx
// src/components/ui/page-header.tsx
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="space-y-0.5">
      <h1 className="font-display text-2xl font-bold text-cream">{title}</h1>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </header>
  );
}
```

```tsx
// src/components/ui/stat-card.tsx
export function StatCard({ label, value, tone = 'money' }: {
  label: string; value: string; tone?: 'money' | 'negative' | 'neutral';
}) {
  const color = tone === 'money' ? 'text-money' : tone === 'negative' ? 'text-negative' : 'text-cream';
  return (
    <div className="bg-gradient-to-br from-card to-surface border border-line rounded-xl p-4">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className={`text-2xl font-bold tnum ${color}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 5: Vérifier + commit**

Run: `npx tsc --noEmit` propre, `npm run build` OK (composants pas encore consommés : normal).
```bash
git add src/components/
git commit -m "feat(ui): composants Button, Badge, Card, PageHeader, StatCard"
```

### Task 5: Composants UI — lot 2 (champs, SearchBox, EmptyState)

**Files:** Create `src/components/ui/fields.tsx`, `search-box.tsx`, `empty-state.tsx`

- [ ] **Step 1: Champs de formulaire**

```tsx
// src/components/ui/fields.tsx
const FIELD = 'bg-night border border-line rounded-[10px] p-3 text-cream placeholder:text-muted focus:outline-2 focus:outline-action min-h-12';

export function Input({ className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD} ${className}`} {...rest}>{children}</select>;
}

export function DateField({ className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" className={`${FIELD} ${className}`} {...rest} />;
}
```

- [ ] **Step 2: SearchBox (contrôlée, client)**

```tsx
// src/components/ui/search-box.tsx
'use client';
import { Search } from 'lucide-react';

export function SearchBox({ value, onChange, placeholder = 'Rechercher un produit…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-2 bg-card border border-line rounded-[10px] px-3 min-h-12 focus-within:outline-2 focus-within:outline-action">
      <Search className="size-4 text-muted shrink-0" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="bg-transparent flex-1 text-cream placeholder:text-muted outline-none" />
    </label>
  );
}
```

- [ ] **Step 3: EmptyState**

```tsx
// src/components/ui/empty-state.tsx
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, message, actionHref, actionLabel }: {
  icon: LucideIcon; message: string; actionHref?: string; actionLabel?: string;
}) {
  return (
    <div className="bg-card border border-line rounded-xl p-8 text-center space-y-3">
      <Icon className="size-8 text-muted mx-auto" aria-hidden />
      <p className="text-muted">{message}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="inline-block text-action font-semibold underline underline-offset-4">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Vérifier + commit**

```bash
npx tsc --noEmit && npm run build
git add src/components/
git commit -m "feat(ui): champs, SearchBox, EmptyState"
```

### Task 6: TopBar, BottomNav, layout protégé

**Files:**
- Create: `src/components/ui/top-bar.tsx`, `src/components/ui/bottom-nav.tsx`
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 1: TopBar (server component — reçoit le nom/emplacement, contient le form logout)**

```tsx
// src/components/ui/top-bar.tsx
import { logout } from '@/app/login/actions';
import { LogOut } from 'lucide-react';

export function TopBar({ userName, locationName }: { userName: string; locationName: string | null }) {
  return (
    <header className="sticky top-0 z-10 bg-night/95 backdrop-blur border-b border-line px-4 py-3 flex items-center justify-between">
      <span className="font-display text-lg font-bold text-cream">
        Sky<span className="text-action">v</span>iew
      </span>
      <form action={logout} className="flex items-center gap-2 text-sm text-muted">
        <span>{userName}{locationName ? ` · ${locationName}` : ''}</span>
        <button className="p-2 rounded-[10px] hover:bg-surface" title="Déconnexion" aria-label="Déconnexion">
          <LogOut className="size-4" aria-hidden />
        </button>
      </form>
    </header>
  );
}
```

- [ ] **Step 2: BottomNav (client — usePathname pour l'état actif ; icônes par nom)**

```tsx
// src/components/ui/bottom-nav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, ShoppingCart, PackageOpen, CalendarClock, ClipboardList,
  Truck, LayoutDashboard, Upload, Scale, Package, ReceiptText, Users, Wrench,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  stock: BarChart3, commandes: ShoppingCart, receptions: PackageOpen,
  sorties: CalendarClock, inventaire: ClipboardList, livraisons: Truck,
  compta: LayoutDashboard, imports: Upload, rapprochements: Scale,
  produits: Package, articles: ReceiptText, utilisateurs: Users, ajustements: Wrench,
};

export interface NavItem { href: string; label: string; icon: keyof typeof ICONS }

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 bg-card border-t border-line flex justify-around px-1 pt-1.5 pb-2.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link key={item.href} href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-[10px] text-[11px] leading-tight
              ${active ? 'text-action font-bold' : 'text-muted hover:text-cream'}`}>
            <Icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Layout protégé — `src/app/(protected)/layout.tsx`**

Remplacer intégralement (même logique de session/NAV, nouvelle présentation ; les items gagnent un champ `icon`) :

```tsx
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import type { Role } from '@/lib/auth';
import { TopBar } from '@/components/ui/top-bar';
import { BottomNav, type NavItem } from '@/components/ui/bottom-nav';
import { db } from '@/db';
import { locations } from '@/db/schema';
import { eq } from 'drizzle-orm';

const barmanNav: NavItem[] = [
  { href: '/stock', label: 'Stock', icon: 'stock' },
  { href: '/commandes', label: 'Commandes', icon: 'commandes' },
  { href: '/receptions', label: 'Réceptions', icon: 'receptions' },
  { href: '/sorties', label: 'Sorties', icon: 'sorties' },
  { href: '/inventaire', label: 'Inventaire', icon: 'inventaire' },
];

const NAV: Record<Role, NavItem[]> = {
  magasinier: [{ href: '/livraisons', label: 'Livraisons', icon: 'livraisons' }],
  barman: barmanNav,
  cuisinier: barmanNav,
  comptable: [
    { href: '/compta', label: 'Tableau', icon: 'compta' },
    { href: '/compta/imports', label: 'Ventes', icon: 'imports' },
    { href: '/compta/rapprochements', label: 'Rapproch.', icon: 'rapprochements' },
  ],
  admin: [
    { href: '/admin/produits', label: 'Produits', icon: 'produits' },
    { href: '/admin/articles', label: 'Articles', icon: 'articles' },
    { href: '/admin/utilisateurs', label: 'Comptes', icon: 'utilisateurs' },
    { href: '/admin/ajustements', label: 'Ajustements', icon: 'ajustements' },
  ],
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  let locationName: string | null = null;
  if (session.locationId) {
    const [loc] = await db.select().from(locations).where(eq(locations.id, session.locationId));
    locationName = loc?.name ?? null;
  }
  return (
    <div className="min-h-dvh bg-night pb-24">
      <TopBar userName={session.name} locationName={locationName} />
      <main className="p-4 max-w-3xl mx-auto space-y-4">{children}</main>
      <BottomNav items={NAV[session.role] ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Vérifier + commit**

Run: `npm test` verts, `npx tsc --noEmit`, `npm run build`. Vérif visuelle : header marque + nav icônes (connexion nécessaire → vérifier au moins que /login s'affiche et que le build passe si pas de compte local).

```bash
git add src/components/ src/app/
git commit -m "feat(ui): TopBar marque + BottomNav lucide + layout nuit"
```

### Règles de conversion communes aux tâches d'écrans (7 à 11)

Chaque écran est converti selon ce tableau — **la structure JSX, les server actions, les données chargées et les noms de champs de formulaire ne changent pas** :

| Ancien motif | Nouveau |
|---|---|
| `<h1 className="text-lg font-bold">…` | `<PageHeader title="…" subtitle="…" />` |
| `bg-white rounded-xl shadow` (carte/liste) | `<Card>` / `<ListRow>` (tone warning/negative si liseré d'alerte) |
| `bg-indigo-50 …` (bandeau valeur) | `<StatCard label="…" value="… FCFA" />` |
| `<button className="bg-indigo-600 …">` | `<Button pending={pending}>` (primaire) / `<Button variant="ghost">` |
| `<input className="border rounded p-2 …">` | `<Input />` — `<select>` → `<Select>` — date → `<DateField>` |
| Badges texte (`seuil bas`, `négatif !`, statuts) | `<Badge tone="warning|negative|success|neutral">` |
| `text-gray-500` / `text-gray-400` / `text-gray-600` | `text-muted` |
| `text-red-600` (erreurs & écarts) | `text-negative` |
| `text-green-700`, `text-amber-700`, valeurs FCFA | `text-success`, `text-warning`, `text-money tnum` |
| `<p className="text-gray-500">Aucun …</p>` | `<EmptyState icon={…} message="…" [action] />` |
| Emojis dans les titres/labels | supprimés (les icônes vivent dans la nav et les EmptyStates) |

Quantités et montants : ajouter la classe `tnum`. Chaque tâche d'écran se termine par tests + tsc + build + vérification visuelle + commit.

### Task 7: Écrans stock + sorties (avec recherche, fréquents, catégories)

**Files:**
- Modify: `src/app/(protected)/stock/page.tsx`, `src/app/(protected)/sorties/page.tsx`, `src/app/(protected)/sorties/exit-form.tsx`
- Create: `src/app/(protected)/stock/stock-list.tsx` (client — liste filtrable)

- [ ] **Step 1: Stock — liste filtrable (client)**

```tsx
// src/app/(protected)/stock/stock-list.tsx
'use client';
import { useState } from 'react';
import { SearchBox } from '@/components/ui/search-box';
import { ListRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { matchesQuery } from '@/lib/text';

export interface StockItem {
  productId: number; name: string; baseUnit: string;
  qty: number; value: number; belowThreshold: boolean;
}

export function StockList({ items }: { items: StockItem[] }) {
  const [query, setQuery] = useState('');
  const visible = items.filter((i) => matchesQuery(i.name, query));
  return (
    <div className="space-y-2">
      <SearchBox value={query} onChange={setQuery} />
      {visible.map((l) => (
        <ListRow key={l.productId} tone={l.qty < 0 ? 'negative' : l.belowThreshold ? 'warning' : 'default'}>
          <span>
            <span className="font-semibold text-cream">{l.name}</span>
            {l.qty < 0 && <span className="ml-2 align-middle"><Badge tone="negative">négatif !</Badge></span>}
            {l.qty >= 0 && l.belowThreshold && <span className="ml-2 align-middle"><Badge tone="warning">seuil bas</Badge></span>}
            <br /><span className="text-sm text-money tnum">{l.value.toLocaleString('fr-FR')} FCFA</span>
          </span>
          <span className={`text-lg font-bold tnum text-right ${l.qty < 0 ? 'text-negative' : l.belowThreshold ? 'text-warning' : 'text-cream'}`}>
            {l.qty}<br /><span className="text-xs font-normal text-muted">{l.baseUnit}</span>
          </span>
        </ListRow>
      ))}
      {visible.length === 0 && <p className="text-muted text-sm p-2">Aucun produit ne correspond.</p>}
    </div>
  );
}
```

`stock/page.tsx` : conserve requireRole/garde admin/getLocationStock tels quels ; rend `<PageHeader title="Mon stock" />`, `<StatCard label="Valeur totale" value={…} />`, puis `<StockList items={…} />` (mapper les StockLine ; EmptyState `PackageSearch` si liste vide).

- [ ] **Step 2: Sorties — formulaire avec recherche + groupes + fréquents**

`sorties/page.tsx` : en plus des produits, charger `const freq = await getFrequentProducts(db, session.locationId!)` et construire `const groups = groupProducts(prods.map(p => ({ id: p.id, name: p.name, category: p.category, baseUnit: p.baseUnit })), freq)` — passer `groups` à `ExitForm` (au lieu de `products` plat). PageHeader + Card autour du formulaire ; « Dernières saisies » en ListRow.

`exit-form.tsx` — changements : prop `groups: Array<{ label: string; products: Array<{id: number; name: string; baseUnit: string}> }>` ; une `SearchBox` au-dessus des lignes filtre les options via `matchesQuery` (groupes vidés masqués) ; les `<select>` rendent :

```tsx
{filteredGroups.map((g) => (
  <optgroup key={g.label} label={g.label}>
    {g.products.map((p) => (
      <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>
    ))}
  </optgroup>
))}
```

Le reste (clientToken, reset au succès, warnings ambre, noms de champs `lineProduct`/`lineQty`/`serviceDate`) est INCHANGÉ ; les inputs passent aux composants `Input`/`Select`/`DateField`/`Button pending`. Warnings : `<ListRow tone="warning">⚠ …</ListRow>` ; succès : texte `text-success`.

- [ ] **Step 3: Vérifier + commit**

`npm test` (93 verts) · tsc · build · vérif visuelle /stock et /sorties (recherche, groupes ★ Fréquents).
```bash
git add src/app/ && git commit -m "refactor(ui): écrans stock et sorties en thème lounge + recherche/fréquents/catégories"
```

### Task 8: Écrans commandes + réceptions

**Files:**
- Modify: `src/app/(protected)/commandes/page.tsx`, `order-form.tsx`, `src/app/(protected)/receptions/page.tsx`, `[id]/page.tsx`, `[id]/reception-form.tsx`

- [ ] **Step 1: Commandes** — même traitement que sorties : page charge `getFrequentProducts` + `groupProducts`, `OrderForm` reçoit `groups` (le pack info reste dans le label d'option : `` `${p.name} (${p.baseUnit}${p.packName ? `, ${p.packName}=${p.packSize}` : ''})` `` — étendre l'interface du groupe avec `packName`/`packSize`), SearchBox de filtre, composants Button/Select/Input, statuts en `<Badge>` : `en_attente` → neutral « En attente », `livree` → warning « À réceptionner », `receptionnee` → success « Réceptionnée ». Liste des commandes en `<Card className="p-3">`. EmptyState `ShoppingCart` (« Aucune commande — passez votre première commande ci-dessus »).

- [ ] **Step 2: Réceptions** — `receptions/page.tsx` : PageHeader, liens en `<Card className="p-4 font-semibold">`, EmptyState `PackageOpen` avec action « Passer une commande » → `/commandes`. `[id]/page.tsx` + `reception-form.tsx` : ListRow par produit (nom + « livré : N » en text-muted), `Input` quantité `tnum`, bouton de confirmation `<Button className="w-full">Confirmer la réception</Button>` — le vert de l'ancien bouton devient le rouge d'action standard (le rouge = action principale, spec §3).

- [ ] **Step 3: Vérifier + commit**

```bash
git add src/app/ && git commit -m "refactor(ui): commandes et réceptions en thème lounge"
```

### Task 9: Écrans livraisons + inventaire

**Files:**
- Modify: `src/app/(protected)/livraisons/page.tsx`, `[id]/page.tsx`, `[id]/delivery-form.tsx`, `src/app/(protected)/inventaire/page.tsx`, `inventory-form.tsx`

- [ ] **Step 1: Livraisons** — liste : `<Card>` par commande (n°, emplacement, date en text-muted), EmptyState `Truck` (« Aucune commande en attente »). Détail : chaque ligne en `<Card className="p-3 space-y-2">` avec le demandé en text-muted, inputs packs/unités en `<Input className="w-24">`, bouton `<Button pending>Enregistrer la livraison</Button>`.

- [ ] **Step 2: Inventaire** — `inventory-form.tsx` : ajouter une `SearchBox` (état client `query`) filtrant les lignes par `matchesQuery(l.name, query)` — les lignes masquées NE DOIVENT PAS être retirées du DOM (sinon leurs valeurs saisies sortent du FormData) : les masquer avec `hidden` sur le conteneur de ligne. Théorique en text-muted, input compté `tnum`. Vue résultat (gaps) : lignes en ListRow, écarts non nuls en `text-negative tnum`, valeur FCFA `tnum`, en-tête `text-success`. Bouton `<Button pending>Valider l'inventaire</Button>`.

- [ ] **Step 3: Vérifier + commit**

```bash
git add src/app/ && git commit -m "refactor(ui): livraisons et inventaire en thème lounge + recherche inventaire"
```

### Task 10: Écrans compta (tableau de bord, imports, rapprochements)

**Files:**
- Modify: `src/app/(protected)/compta/page.tsx`, `compta/imports/page.tsx`, `upload-form.tsx`, `match-form.tsx`, `compta/rapprochements/page.tsx`

- [ ] **Step 1: Tableau de bord** — par emplacement : `<StatCard label={loc.name} value={total FCFA} />` + sous-texte « N produit(s) » ; alertes en `<ListRow tone="warning|negative">` avec Badge. Derniers inventaires : ListRow, écart négatif `text-negative tnum`, sinon `text-cream tnum`. EmptyState `ClipboardList` si aucun inventaire.

- [ ] **Step 2: Imports** — upload en `<Card className="p-4">` avec `DateField`, input file stylé (`text-muted file:bg-surface file:border-0 file:rounded-[10px] file:px-3 file:py-2 file:text-cream file:mr-3`), `<Button pending>Importer les ventes</Button>` ; résumé en `text-success`. Bloc correspondances : `<Card tone="warning" className="p-3 space-y-2">`, chaque ligne avec `<Select>` compact et `<Button variant="ghost" className="min-h-9 px-3 text-xs">Associer</Button>`. Liste des imports : ListRow avec lien `text-action underline`.

- [ ] **Step 3: Rapprochements** — bandeau « non reconnus » en `<Card tone="warning" className="p-3">` (inchangé sur le fond). Sélecteur d'imports en pastilles : actives `bg-action text-white`, sinon `border border-line text-muted`. Tableau : `<table>` dans une Card, `thead` text-muted uppercase text-xs, lignes d'écart `bg-negative/10`, colonne écart `text-negative tnum`, total en pied `text-money tnum font-bold`. Total général : `<StatCard label="Écart total valorisé" value="… FCFA" tone={total < 0 ? 'negative' : 'money'} />`.

- [ ] **Step 4: Vérifier + commit**

```bash
git add src/app/ && git commit -m "refactor(ui): écrans comptables en thème lounge"
```

### Task 11: Écrans admin + labels français + balayage final

**Files:**
- Modify: `src/app/(protected)/admin/produits/page.tsx`, `product-form.tsx`, `admin/articles/page.tsx`, `article-form.tsx`, `admin/utilisateurs/page.tsx`, `user-form.tsx`, `admin/ajustements/page.tsx`, `adjustment-form.tsx`
- Create: `src/app/(protected)/admin/produits/product-list.tsx` (client — liste filtrable)

- [ ] **Step 1: Admin produits** — formulaire en Card + composants de champs ; liste extraite dans `product-list.tsx` (client) : `SearchBox` + filtre `matchesQuery(p.name, query)`, ListRow par produit (pack info + prix en `text-money tnum`, inactifs en Badge neutral « inactif »).

- [ ] **Step 2: Admin articles & utilisateurs** — conversion standard (Card, champs, Button, Badge « désactivé »). Les `<select>` de la fiche technique gardent leur structure (pas de tri fréquence côté admin — hors spec).

- [ ] **Step 3: Admin ajustements + labels français** — dans `admin/ajustements/page.tsx`, importer `MOVEMENT_LABELS` de `@/lib/movement-labels` et remplacer l'affichage brut `{m.type}` par `{MOVEMENT_LABELS[m.type] ?? m.type}`. Journal en ListRow compactes (`text-xs`), quantités signées `tnum` (`text-success` si > 0, `text-negative` si < 0), motif en italique text-muted.

- [ ] **Step 4: Balayage final**
- `grep -rn "bg-white\|bg-gray-50\|text-gray-\|indigo" src/app src/components` → doit être vide (aucun résidu du thème clair).
- `grep -rn "📊\|🛒\|📥\|🌙\|📋\|📦\|🧾\|👤\|🔧\|⚠️\|✅" src/app src/components` → vide (plus d'emojis ; ⚠/✓ typographiques tolérés dans les textes).
- `npm test` (93 verts) · `npx tsc --noEmit` · `npm run lint` · `npm run build`.
- Vérification visuelle de chaque écran dans l'aperçu (les 16), smartphone simulé (viewport mobile).

- [ ] **Step 5: Commit final**

```bash
git add src/app/ && git commit -m "refactor(ui): écrans admin en thème lounge + labels mouvements + balayage final"
```

---

## Auto-révision du plan (faite à la rédaction)

**Couverture spec :** tokens+typo+icônes §3 (T1), composants §4 (T4-T5), TopBar/BottomNav §5 (T6), UX §6.1 recherche (T7 stock/sorties, T8 commandes, T9 inventaire, T11 produits admin), §6.2 fréquents (T3 lib + T7/T8 usage), §6.3 catégories (T2 lib + T7/T8), §6.4 labels (T2 + T11), §6.5 EmptyStates (T7-T11), écrans §7 (T1 login, T6 layout/error, T7-T11 les 16), erreurs/états §9 (Button pending T4, ListRow d'erreur dans les conversions), tests §10 (T2/T3 TDD, garde-fou 87 tests à chaque tâche). Rien d'orphelin.

**Points d'attention pour l'exécutant :**
- Le compte de tests passe de 87 → 91 (T2) → 93 (T3) ; les tâches 7-11 n'en ajoutent pas.
- `rounded-(--radius-card)` : syntaxe Tailwind v4 à vérifier sur la version installée ; repli littéral autorisé (noté en T1).
- L'inventaire filtré doit MASQUER (hidden), pas démonter les lignes (T9 — FormData).
- Ne pas toucher aux noms de champs des formulaires (`lineProduct`, `lineQty`, `clientToken`…) ni aux actions.


