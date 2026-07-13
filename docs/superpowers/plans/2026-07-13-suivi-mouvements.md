# Plan d'implémentation — Suivi des mouvements de stock (comptable)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au comptable une page `/compta/mouvements` : par emplacement et par période, stock initial, mouvements ventilés (réceptions / sorties / ajustements), stock final, valorisation FCFA initial+final, filtres date/emplacement/produit/article, et journal détaillé par produit.

**Architecture:** Une nouvelle lib pure `src/lib/movement-report.ts` (TDD, 2 requêtes SQL agrégées sur le journal immuable `stockMovements` ; stock final dérivé) + une page serveur à filtres GET (pattern de `/compta/rapprochements`). Aucune migration, aucune lib existante modifiée.

**Tech Stack:** Existant uniquement — Next 16, Drizzle/PGlite, Vitest, composants ui/ maison.

**Spec :** `docs/superpowers/specs/2026-07-13-suivi-mouvements-design.md`

---

## Structure des fichiers

```
src/lib/movement-report.ts             # NOUVEAU : getMovementReport, getMovementDetail, MOVEMENT_TYPE_LABELS
src/app/(protected)/compta/mouvements/page.tsx   # NOUVEAU : page serveur, filtres GET
src/app/(protected)/layout.tsx         # MODIFIÉ : 4ᵉ entrée nav comptable (ajout pur)
src/components/ui/bottom-nav.tsx       # MODIFIÉ : icône 'mouvements' (ArrowLeftRight, ajout pur)
tests/integration/movement-report.test.ts        # NOUVEAU : 8 tests
```

**Conventions transverses (rappel des règles durcies) :**
- Branche `feature/suivi-mouvements` (déjà créée, porte le commit de spec b9dc1de) ; `git branch --show-current` avant chaque commit ; sanity : **146 tests / 27 fichiers** au départ.
- LOGIQUE INTOUCHABLE : aucune modification des libs/tests existants ; seuls layout.tsx et bottom-nav.tsx reçoivent des ajouts purs.
- Pas de server action dans cette phase (formulaire GET) ; le bouton Filtrer est `type="submit"` EXPLICITE (Button défaut type="button").
- `requireRole(['comptable'])` en tête de page ; textes français ; classes du thème existantes.

---

### Task 1: getMovementReport (TDD)

**Files:**
- Create: `src/lib/movement-report.ts`
- Test: `tests/integration/movement-report.test.ts`

- [ ] **Step 1: Tests qui échouent** — créer `tests/integration/movement-report.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { getMovementReport } from '@/lib/movement-report';
import { stockMovements } from '@/db/schema';

type Mv = {
  productId: number; locationId: number;
  type: 'reception' | 'sortie_service' | 'ajustement_inventaire' | 'ajustement_admin';
  qty: number; userId: number; createdAt: string;
};
// createdAt explicite (ISO local) : les tests contrôlent la datation du journal.
async function insertMovements(db: Awaited<ReturnType<typeof createTestDb>>, mvs: Mv[]) {
  await db.insert(stockMovements).values(mvs.map((m) => ({
    productId: m.productId, locationId: m.locationId, type: m.type,
    qty: String(m.qty), userId: m.userId, createdAt: new Date(m.createdAt),
  })));
}

describe('getMovementReport', () => {
  it('stock initial = somme avant la période ; aucune colonne de période ; final = initial', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 24, userId: barman.id, createdAt: '2026-02-10T10:00:00' },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: -4, userId: barman.id, createdAt: '2026-02-20T22:00:00' },
    ]);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: 'Castel 65cl', baseUnit: 'bouteille',
      initial: 20, receptions: 0, sorties: 0, ajustements: 0, final: 20,
    });
  });
  it('ventile la période par type : réceptions +, sorties en absolu, ajustements signés', async () => {
    const db = await createTestDb();
    const { cuisine, cuisinier, admin } = await seedBase(db);
    const poulet = await saveProduct(db, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 });
    await insertMovements(db, [
      { productId: poulet.id!, locationId: cuisine.id, type: 'reception', qty: 5, userId: cuisinier.id, createdAt: '2026-02-15T09:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'reception', qty: 10, userId: cuisinier.id, createdAt: '2026-03-05T09:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'sortie_service', qty: -4, userId: cuisinier.id, createdAt: '2026-03-10T21:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'ajustement_inventaire', qty: -1, userId: cuisinier.id, createdAt: '2026-03-15T18:00:00' },
      { productId: poulet.id!, locationId: cuisine.id, type: 'ajustement_admin', qty: 2, userId: admin.id, createdAt: '2026-03-20T11:00:00' },
    ]);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: cuisine.id });
    expect(l.initial).toBe(5);
    expect(l.receptions).toBe(10);
    expect(l.sorties).toBe(4);        // valeur absolue
    expect(l.ajustements).toBe(1);    // -1 + 2, signé
    expect(l.final).toBe(12);         // 5 + 10 - 4 + 1
  });
  it('bornes : le jour « du » et le jour « au » sont inclus, la veille compte dans l’initial, le lendemain est exclu', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await insertMovements(db, [
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 1, userId: barman.id, createdAt: '2026-02-28T23:59:00' }, // veille -> initial
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 2, userId: barman.id, createdAt: '2026-03-01T00:01:00' }, // jour du -> période
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 4, userId: barman.id, createdAt: '2026-03-31T23:58:00' }, // jour au -> période
      { productId: riz.id!, locationId: bar.id, type: 'reception', qty: 8, userId: barman.id, createdAt: '2026-04-01T00:01:00' }, // lendemain -> exclu
    ]);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(l.initial).toBe(1);
    expect(l.receptions).toBe(6);
    expect(l.final).toBe(7); // le mouvement d'avril n'apparaît nulle part
  });
  it('productIds restreint aux produits listés ; liste vide -> résultat vide', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const guinness = await saveProduct(db, { name: 'Guinness', baseUnit: 'bouteille', purchasePrice: 800 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 10, userId: barman.id, createdAt: '2026-03-02T10:00:00' },
      { productId: guinness.id!, locationId: bar.id, type: 'reception', qty: 6, userId: barman.id, createdAt: '2026-03-02T10:00:00' },
    ]);
    const lines = await getMovementReport(db, {
      from: '2026-03-01', to: '2026-03-31', locationId: bar.id, productIds: [castel.id!],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Castel');
    expect(await getMovementReport(db, {
      from: '2026-03-01', to: '2026-03-31', locationId: bar.id, productIds: [],
    })).toEqual([]);
  });
  it('jamais bougé -> absent ; consommé à zéro -> présent avec 0 partout au final', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    await saveProduct(db, { name: 'Jamais bougé', baseUnit: 'kg', purchasePrice: 100 });
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 6, userId: barman.id, createdAt: '2026-02-10T10:00:00' },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: -6, userId: barman.id, createdAt: '2026-02-11T22:00:00' },
    ]);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(lines).toHaveLength(1); // « Jamais bougé » absent
    expect(lines[0]).toMatchObject({ name: 'Castel', initial: 0, final: 0 });
  });
  it('valorise initial et final au prix d’achat (arrondi entier)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 10, userId: barman.id, createdAt: '2026-02-10T10:00:00' },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: -2.5, userId: barman.id, createdAt: '2026-03-10T22:00:00' },
    ]);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(l.initialValue).toBe(6500);       // 10 × 650
    expect(l.finalValue).toBe(4875);         // 7,5 × 650
  });
});
```

- [ ] **Step 2:** Run `npm test -- tests/integration/movement-report.test.ts` → FAIL (module introuvable).

- [ ] **Step 3: Implémenter** `src/lib/movement-report.ts` :

```ts
import { and, asc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';
import { stockMovements, products, users } from '@/db/schema';
import { round3 } from './units';
import type { AnyDb } from '@/db';

export interface MovementReportLine {
  productId: number; name: string; baseUnit: string;
  initial: number; receptions: number; sorties: number; ajustements: number; final: number;
  initialValue: number; finalValue: number; // FCFA
}

export interface MovementDetailLine {
  createdAt: Date; type: string; typeLabel: string;
  qty: number; reason: string | null; userName: string;
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  reception: 'Réception',
  sortie_service: 'Sortie service',
  ajustement_inventaire: 'Ajustement inventaire',
  ajustement_admin: 'Ajustement admin',
};

// Bornes en jours pleins : « du » à 00:00:00 inclus, « au » à 23:59:59.999 inclus
// (createdAt est un timestamp ; le comptable raisonne en jours). Datation par
// createdAt (moment de l'écriture), pas serviceDate — réalité du journal, spec §3.1.
function dayStart(d: string): Date { return new Date(`${d}T00:00:00`); }
function dayEnd(d: string): Date { return new Date(`${d}T23:59:59.999`); }

// Rapport par produit sur une période : initial (somme avant), mouvements de la
// période ventilés par type, final DÉRIVÉ (pas de 3e requête). Un produit apparaît
// s'il a bougé avant OU pendant la période (même sémantique que getLocationStock :
// consommé à zéro -> présent, jamais bougé -> absent). Spec §3.1.
export async function getMovementReport(db: AnyDb, opts: {
  from: string; to: string; locationId: number; productIds?: number[];
}): Promise<MovementReportLine[]> {
  if (opts.productIds && opts.productIds.length === 0) return []; // inArray([]) interdit par drizzle
  const filters: SQL[] = [eq(stockMovements.locationId, opts.locationId)];
  if (opts.productIds) filters.push(inArray(stockMovements.productId, opts.productIds));

  const before: Array<{ productId: number; qty: string }> = await db.select({
    productId: stockMovements.productId,
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  }).from(stockMovements)
    .where(and(...filters, lt(stockMovements.createdAt, dayStart(opts.from))))
    .groupBy(stockMovements.productId);

  const during: Array<{ productId: number; type: string; qty: string }> = await db.select({
    productId: stockMovements.productId,
    type: stockMovements.type,
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  }).from(stockMovements)
    .where(and(...filters,
      gte(stockMovements.createdAt, dayStart(opts.from)),
      lte(stockMovements.createdAt, dayEnd(opts.to))))
    .groupBy(stockMovements.productId, stockMovements.type);

  const byProduct = new Map<number, { initial: number; receptions: number; sorties: number; ajustements: number }>();
  const entry = (id: number) => {
    if (!byProduct.has(id)) byProduct.set(id, { initial: 0, receptions: 0, sorties: 0, ajustements: 0 });
    return byProduct.get(id)!;
  };
  for (const b of before) entry(b.productId).initial = round3(Number(b.qty));
  for (const d of during) {
    const e = entry(d.productId);
    const q = Number(d.qty);
    if (d.type === 'reception') e.receptions = round3(e.receptions + q);
    else if (d.type === 'sortie_service') e.sorties = round3(e.sorties + Math.abs(q));
    else e.ajustements = round3(e.ajustements + q); // inventaire + admin, signés (spec : une colonne)
  }
  if (byProduct.size === 0) return [];

  const infos: Array<{ id: number; name: string; baseUnit: string; purchasePrice: number }> =
    await db.select({
      id: products.id, name: products.name,
      baseUnit: products.baseUnit, purchasePrice: products.purchasePrice,
    }).from(products).where(inArray(products.id, [...byProduct.keys()]));
  const infoById = new Map(infos.map((p) => [p.id, p]));

  return [...byProduct.entries()]
    .map(([productId, e]) => {
      const info = infoById.get(productId)!;
      const final = round3(e.initial + e.receptions - e.sorties + e.ajustements);
      return {
        productId, name: info.name, baseUnit: info.baseUnit,
        initial: e.initial, receptions: e.receptions, sorties: e.sorties,
        ajustements: e.ajustements, final,
        initialValue: Math.round(e.initial * info.purchasePrice),
        finalValue: Math.round(final * info.purchasePrice),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// Journal chronologique d'UN produit sur la période (détail sous la synthèse).
export async function getMovementDetail(db: AnyDb, opts: {
  from: string; to: string; locationId: number; productId: number;
}): Promise<MovementDetailLine[]> {
  const rows: Array<{ createdAt: Date; type: string; qty: string; reason: string | null; userName: string }> =
    await db.select({
      createdAt: stockMovements.createdAt, type: stockMovements.type,
      qty: stockMovements.qty, reason: stockMovements.reason, userName: users.name,
    }).from(stockMovements)
      .innerJoin(users, eq(stockMovements.userId, users.id))
      .where(and(
        eq(stockMovements.locationId, opts.locationId),
        eq(stockMovements.productId, opts.productId),
        gte(stockMovements.createdAt, dayStart(opts.from)),
        lte(stockMovements.createdAt, dayEnd(opts.to))))
      .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));
  return rows.map((r) => ({
    createdAt: r.createdAt, type: r.type,
    typeLabel: MOVEMENT_TYPE_LABELS[r.type] ?? r.type,
    qty: round3(Number(r.qty)), reason: r.reason, userName: r.userName,
  }));
}
```

- [ ] **Step 4:** `npm test -- tests/integration/movement-report.test.ts` → les 6 tests du describe `getMovementReport` passent. Full `npm test` → verts (146 + 6 = 152). `npx tsc --noEmit` propre.
- [ ] **Step 5: Commit** — `git add src/lib/movement-report.ts tests/integration/movement-report.test.ts && git commit -m "feat(compta): rapport de mouvements par période (TDD)"`

### Task 2: getMovementDetail — tests (TDD)

`getMovementDetail` est déjà implémentée en Task 1 (même fichier) ; cette tâche la couvre par des tests dédiés. Si Task 1 a été faite correctement, Step 1 passe directement au VERT après écriture — c'est attendu : le contrat de la fonction est fixé ici.

**Files:**
- Modify: `tests/integration/movement-report.test.ts` (ajout d'un describe — c'est le fichier de CETTE phase, pas un test préexistant)

- [ ] **Step 1: Ajouter le describe** à la fin de `tests/integration/movement-report.test.ts` :

```ts
// (ajouter aux imports en tête de fichier :)
// import { getMovementDetail } from '@/lib/movement-report';

describe('getMovementDetail', () => {
  it('journal chronologique : libellés français, quantité signée, motif et utilisateur', async () => {
    const db = await createTestDb();
    const { bar, barman, admin } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: -3, userId: barman.id, createdAt: '2026-03-10T22:00:00' },
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 12, userId: barman.id, createdAt: '2026-03-05T10:00:00' },
    ]);
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'ajustement_admin',
      qty: '2', reason: 'Casse comptée en trop', userId: admin.id,
      createdAt: new Date('2026-03-15T11:00:00'),
    });
    const detail = await getMovementDetail(db, {
      from: '2026-03-01', to: '2026-03-31', locationId: bar.id, productId: castel.id!,
    });
    expect(detail.map((d) => d.typeLabel)).toEqual(['Réception', 'Sortie service', 'Ajustement admin']); // ordre chrono
    expect(detail[1].qty).toBe(-3);
    expect(detail[2].reason).toBe('Casse comptée en trop');
    expect(detail[0].userName).toBe('Bar');
    expect(detail[2].userName).toBe('Admin');
  });
  it('respecte les bornes de période et le couple (produit, emplacement)', async () => {
    const db = await createTestDb();
    const { bar, cuisine, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await insertMovements(db, [
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 5, userId: barman.id, createdAt: '2026-02-20T10:00:00' },  // hors période
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: 6, userId: barman.id, createdAt: '2026-03-05T10:00:00' },
      { productId: castel.id!, locationId: cuisine.id, type: 'reception', qty: 7, userId: barman.id, createdAt: '2026-03-06T10:00:00' }, // autre emplacement
    ]);
    const detail = await getMovementDetail(db, {
      from: '2026-03-01', to: '2026-03-31', locationId: bar.id, productId: castel.id!,
    });
    expect(detail).toHaveLength(1);
    expect(detail[0].qty).toBe(6);
  });
});
```

- [ ] **Step 2:** `npm test -- tests/integration/movement-report.test.ts` → 8/8 verts (si un test échoue, corriger `getMovementDetail` dans movement-report.ts, pas le test). Full `npm test` → 154. `npx tsc --noEmit` propre.
- [ ] **Step 3: Commit** — `git add tests/integration/movement-report.test.ts && git commit -m "test(compta): couverture du journal détaillé d'un produit"`

### Task 3: Page /compta/mouvements + nav

**Files:**
- Create: `src/app/(protected)/compta/mouvements/page.tsx`
- Modify: `src/app/(protected)/layout.tsx` (entrée nav, ajout pur), `src/components/ui/bottom-nav.tsx` (icône, ajout pur)

- [ ] **Step 1: page.tsx**

```tsx
import { db } from '@/db';
import { locations, products, recipeLines, saleArticles } from '@/db/schema';
import { asc, eq, ne } from 'drizzle-orm';
import Link from 'next/link';
import { requireRole } from '@/lib/session';
import { isValidDateString } from '@/lib/dates';
import { getMovementDetail, getMovementReport } from '@/lib/movement-report';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { DateField, Select } from '@/components/ui/fields';
import { ArrowLeftRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function MouvementsPage({ searchParams }: {
  searchParams: Promise<{
    du?: string; au?: string; emplacement?: string;
    produit?: string; article?: string; detail?: string; detailLoc?: string;
  }>;
}) {
  await requireRole(['comptable']);
  const sp = await searchParams;

  // Défauts : 1er du mois -> aujourd'hui. Paramètre invalide -> défaut du champ (spec §4.1).
  const now = new Date();
  const defaultDu = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultAu = toDateStr(now);
  let du = sp.du && isValidDateString(sp.du) ? sp.du : defaultDu;
  let au = sp.au && isValidDateString(sp.au) ? sp.au : defaultAu;
  if (du > au) { du = defaultDu; au = defaultAu; } // comparaison lexicale valide en ISO

  // Seuls bar et cuisine sont journalisés (le stock magasin n'est pas suivi).
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin')).orderBy(asc(locations.name));
  const emplacementId = Number(sp.emplacement);
  const selectedLocs = locs.some((l) => l.id === emplacementId)
    ? locs.filter((l) => l.id === emplacementId) : locs;

  const allProducts = await db.select({
    id: products.id, name: products.name, active: products.active,
  }).from(products).orderBy(asc(products.name));
  const allArticles = await db.select({
    id: saleArticles.id, cashName: saleArticles.cashName,
  }).from(saleArticles).orderBy(asc(saleArticles.cashName));

  // Produit et article exclusifs : produit gagne (spec §4.1).
  const produitId = Number(sp.produit);
  const produit = allProducts.find((p) => p.id === produitId);
  const articleId = Number(sp.article);
  const article = !produit ? allArticles.find((a) => a.id === articleId) : undefined;
  let productIds: number[] | undefined;
  let articleIngredients: string[] = [];
  if (produit) {
    productIds = [produit.id];
  } else if (article) {
    const lines = await db.select({ productId: recipeLines.productId })
      .from(recipeLines).where(eq(recipeLines.saleArticleId, article.id));
    productIds = [...new Set(lines.map((l) => l.productId))];
    articleIngredients = allProducts
      .filter((p) => productIds!.includes(p.id)).map((p) => p.name);
  }

  const sections = await Promise.all(selectedLocs.map(async (loc) => ({
    loc,
    lines: await getMovementReport(db, { from: du, to: au, locationId: loc.id, productIds }),
  })));

  // Détail : produit + emplacement valides et affichés, sinon carte absente (spec §4.3).
  const detailProductId = Number(sp.detail);
  const detailLocId = Number(sp.detailLoc);
  const detailLoc = selectedLocs.find((l) => l.id === detailLocId);
  const detailProduct = allProducts.find((p) => p.id === detailProductId);
  const detail = detailLoc && detailProduct
    ? await getMovementDetail(db, { from: du, to: au, locationId: detailLoc.id, productId: detailProduct.id })
    : null;

  // Conserve les filtres courants dans les liens détail / fermer.
  const baseQuery = new URLSearchParams();
  baseQuery.set('du', du); baseQuery.set('au', au);
  if (selectedLocs.length === 1) baseQuery.set('emplacement', String(selectedLocs[0].id));
  if (produit) baseQuery.set('produit', String(produit.id));
  else if (article) baseQuery.set('article', String(article.id));
  const detailHref = (locId: number, prodId: number) =>
    `/compta/mouvements?${baseQuery.toString()}&detail=${prodId}&detailLoc=${locId}`;
  const closeHref = `/compta/mouvements?${baseQuery.toString()}`;

  const empty = sections.every((s) => s.lines.length === 0);
  const nf = (n: number) => n.toLocaleString('fr-FR');

  return (
    <div className="space-y-6">
      <PageHeader title="Mouvements de stock"
        subtitle="Stock initial, mouvements et stock final par emplacement sur la période." />

      <Card className="p-4">
        <form method="get" className="grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1"><span className="text-muted text-xs">Du</span>
            <DateField name="du" defaultValue={du} className="w-full" /></label>
          <label className="space-y-1"><span className="text-muted text-xs">Au</span>
            <DateField name="au" defaultValue={au} className="w-full" /></label>
          <label className="space-y-1"><span className="text-muted text-xs">Emplacement</span>
            <Select name="emplacement" defaultValue={selectedLocs.length === 1 ? String(selectedLocs[0].id) : ''} className="w-full">
              <option value="">Tous</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select></label>
          <label className="space-y-1"><span className="text-muted text-xs">Produit</span>
            <Select name="produit" defaultValue={produit ? String(produit.id) : ''} className="w-full">
              <option value="">Tous</option>
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inactif)'}</option>
              ))}
            </Select></label>
          <label className="space-y-1 col-span-2"><span className="text-muted text-xs">Article caisse (filtre ses ingrédients)</span>
            <Select name="article" defaultValue={article ? String(article.id) : ''} className="w-full">
              <option value="">Tous</option>
              {allArticles.map((a) => <option key={a.id} value={a.id}>{a.cashName}</option>)}
            </Select></label>
          <Button type="submit" className="col-span-2 w-full">Filtrer</Button>
          <a href="/compta/mouvements" className="col-span-2 text-center text-muted underline underline-offset-4 text-xs">
            Réinitialiser</a>
        </form>
      </Card>

      {article && (
        <Card tone="warning" className="p-3 text-warning text-sm">
          Filtré sur les ingrédients de « {article.cashName} » : {articleIngredients.join(', ') || 'aucun'}.
        </Card>
      )}

      {empty && <EmptyState icon={ArrowLeftRight} message="Aucun mouvement ni stock sur la période." />}

      {!empty && sections.map(({ loc, lines }) => (
        <section key={loc.id} className="space-y-2">
          <h2 className="font-display text-lg font-bold text-cream">{loc.name}</h2>
          {lines.length === 0 ? (
            <p className="text-muted text-sm">Aucun mouvement ni stock sur la période pour cet emplacement.</p>
          ) : (
            <>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted text-xs uppercase tracking-wider">
                    <th className="p-2">Produit</th><th>Initial</th><th>Récept.</th>
                    <th>Sorties</th><th>Ajust.</th><th>Final</th><th className="text-right p-2">FCFA</th>
                  </tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.productId} className="border-t border-line">
                        <td className="p-2">
                          <Link href={detailHref(loc.id, l.productId)}
                            className="text-action underline underline-offset-4">{l.name}</Link>
                        </td>
                        <td className="tnum text-cream">{l.initial} {l.baseUnit}</td>
                        <td className="tnum text-cream">{l.receptions}</td>
                        <td className="tnum text-cream">{l.sorties}</td>
                        <td className={`tnum ${l.ajustements < 0 ? 'text-negative' : 'text-cream'}`}>
                          {l.ajustements > 0 ? '+' : ''}{l.ajustements}</td>
                        <td className="tnum text-cream font-semibold">{l.final}</td>
                        <td className="text-right p-2 tnum text-cream">{nf(l.finalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <StatCard label={`Valeur du stock — ${loc.name}`}
                value={`${nf(lines.reduce((s, l) => s + l.initialValue, 0))} → ${nf(lines.reduce((s, l) => s + l.finalValue, 0))} FCFA`}
                tone="money" />
            </>
          )}
          {detail && detailLoc?.id === loc.id && detailProduct && (
            <Card className="p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display font-bold text-cream">
                  Journal — {detailProduct.name} ({loc.name})</h3>
                <Link href={closeHref} className="text-muted text-xs underline underline-offset-4">Fermer</Link>
              </div>
              {detail.length === 0 ? (
                <p className="text-muted text-sm">Aucun mouvement sur la période.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.map((d, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-x-3 border-t border-line pt-1 first:border-0 first:pt-0">
                      <span className="text-muted tnum">
                        {d.createdAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span className="text-cream">{d.typeLabel}{d.reason ? ` — ${d.reason}` : ''}</span>
                      <span className={`tnum font-semibold ${d.qty < 0 ? 'text-negative' : 'text-success'}`}>
                        {d.qty > 0 ? '+' : ''}{d.qty}</span>
                      <span className="text-muted text-xs w-full text-right">par {d.userName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: nav** — dans `src/components/ui/bottom-nav.tsx` : ajouter `ArrowLeftRight` à l'import lucide-react et `mouvements: ArrowLeftRight,` au map ICONS. Dans `src/app/(protected)/layout.tsx`, ajouter à `NAV.comptable` (4ᵉ position) : `{ href: '/compta/mouvements', label: 'Mouvements', icon: 'mouvements' }`. AUCUNE autre modification de ces deux fichiers.

- [ ] **Step 3:** `npm test` (154), `npx tsc --noEmit`, `npx eslint src tests` (le lint global balaie un `.claude/worktrees` pollué — hors périmètre), `npm run build` (route `/compta/mouvements` visible).
- [ ] **Step 4: Commit** — `git add src/app/\(protected\)/compta/mouvements/page.tsx src/app/\(protected\)/layout.tsx src/components/ui/bottom-nav.tsx && git commit -m "feat(compta): page Mouvements (filtres + tableaux par emplacement)"`

### Task 4: Balayage final

- [ ] **Step 1:** `npm test` → **154 tests / 28 fichiers attendus** (146 + 8). `npx tsc --noEmit`, `npx eslint src tests`, `npm run build` propres.
- [ ] **Step 2:** Vérifs ciblées : `grep -n 'type="submit"' src/app/\(protected\)/compta/mouvements/page.tsx` → exactement 1 (le bouton Filtrer). Vérifier qu'aucune lib existante n'est modifiée : `git diff b9dc1de..HEAD --stat -- src/lib` ne doit montrer QUE `movement-report.ts` (nouveau).
- [ ] **Step 3:** README : dans la section comptable, ajouter une ligne mentionnant `/compta/mouvements` (suivi initial/mouvements/final par période, filtres produit/article/emplacement). Suivre le style existant.
- [ ] **Step 4: Commit** — `git add README.md && git commit -m "docs: README — page Mouvements comptable"`

---

## Auto-révision du plan

**Couverture spec :** lib §3.1/§3.2 (T1+T2 — bornes, ventilation, absolu/signé, valorisation, productIds vide, labels français), page §4.1 (filtres GET, défauts, invalides silencieux, exclusivité produit>article, inactifs suffixés), §4.2 (tableau, StatCard initial→final, EmptyState), §4.3 (détail par lien, Fermer, invalide → absent), tests §5 (8 tests couvrant les 7 points — le point 3 « bornes » est testé côté report ET détail), conventions §6 (branche déjà créée, submit explicite, ajouts purs nav), hors-périmètre §7 respecté (pas d'export, pas de magasin). Rien d'orphelin.

**Points d'attention exécutant :**
- Le compte de tests par étape est indicatif (146→152→154) ; l'invariant dur : AUCUN test existant modifié (le fichier movement-report.test.ts est NOUVEAU et appartient à cette phase — T2 l'étend, c'est normal).
- `drizzle` interdit `inArray` sur liste vide → garde `productIds.length === 0 → []` en tête de `getMovementReport` (testée).
- Les dates du formulaire sont comparées lexicalement (`du > au`) — valide car ISO validé par `isValidDateString` d'abord.
- `stockMovements.createdAt` accepte un `createdAt` explicite à l'insert (defaultNow sinon) — les tests en dépendent.
- Next 16 : `searchParams` est une Promise (`await searchParams`) — même pattern que compta/rapprochements.
- La page n'a AUCUNE server action : pas de FormError ici, le formulaire est un GET natif.
