# Plan d'implémentation — Durcissement post-v1 & export Mouvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer les améliorations post-v1 n° 1-5, 7-8 : parseur d'imports durci, plafond d'upload 4 Mo, garde `active` serveur, sessions fraîches (rôle lu en base), `AnyDb` typé, export CSV/Excel des Mouvements avec valorisation complète, outillage lint.

**Architecture:** Modifications chirurgicales de libs existantes (import-table, orders, service-exits, adjustments, session) + 2 libs nouvelles (session-freshness, movement-export) + 1 route export + liens sur la page Mouvements. TDD partout où il y a de la logique. Aucune migration.

**Tech Stack:** Existant uniquement — Next 16, Drizzle/PGlite, xlsx (SheetJS), Vitest.

**Spec :** `docs/superpowers/specs/2026-07-13-durcissement-post-v1-design.md`

---

## Structure des fichiers

```
src/lib/import-table.ts            # MODIFIÉ : en-têtes durcis + MAX_UPLOAD_BYTES
src/lib/orders.ts                  # MODIFIÉ : garde active dans createOrder (chirurgical)
src/lib/service-exits.ts           # MODIFIÉ : garde active dans recordServiceExit (chirurgical)
src/lib/adjustments.ts             # MODIFIÉ : garde active dans recordAdjustment (chirurgical)
src/lib/session-freshness.ts       # NOUVEAU : freshRoleIfAllowed (pur, sans next/*)
src/lib/session.ts                 # MODIFIÉ : requireRole re-vérifie en base
src/db/index.ts                    # MODIFIÉ : AnyDb typé
src/lib/movement-report.ts         # MODIFIÉ : +receptionsValue/sortiesValue/ajustementsValue
src/lib/movement-export.ts         # NOUVEAU : buildMovementExport (csv/xlsx)
src/app/(protected)/compta/mouvements/export/route.ts  # NOUVEAU
src/app/(protected)/compta/mouvements/page.tsx         # MODIFIÉ : liens Exporter (additif)
src/app/(protected)/admin/imports/actions.ts           # MODIFIÉ : plafond 4 Mo
src/app/(protected)/compta/imports/actions.ts          # MODIFIÉ : plafond 4 Mo
eslint.config.mjs                  # MODIFIÉ : ignore .claude/**
tests/unit/import-table.test.ts    # MODIFIÉ : +describe durci (T1) ; −xlsxBuf (T7)
tests/unit/upload-limit.test.ts    # NOUVEAU
tests/integration/active-guard.test.ts        # NOUVEAU
tests/integration/session-freshness.test.ts   # NOUVEAU
tests/integration/movement-export.test.ts     # NOUVEAU
```

**Conventions :** branche `feature/durcissement-post-v1` (créée, porte la spec 0691b74) ; sanity départ **154 tests / 28 fichiers** ; `npx eslint src tests` tant que T7 n'a pas ajouté l'ignore ; aucun test EXISTANT modifié (ajouts de describes et suppression du helper xlsxBuf explicitement autorisés par la spec §2/§8) ; messages français.

---

### Task 1: Durcissement parseTable (TDD)

**Files:**
- Modify: `src/lib/import-table.ts` (bloc de mapping des en-têtes uniquement)
- Modify: `tests/unit/import-table.test.ts` (describe AJOUTÉ en fin de fichier)

- [ ] **Step 1: Tests qui échouent** — ajouter à la fin de `tests/unit/import-table.test.ts` :

```ts
describe('parseTable — en-têtes durcis', () => {
  it("rejette une cellule d'en-tête vide au milieu, avec sa position", () => {
    const res = parseTable(csv('Nom;;Prix\nX;;1\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('position 2');
  });
  it('rejette un en-tête en double (comparaison normalisée)', () => {
    const res = parseTable(csv('Nom;NOM;Prix\nX;Y;1\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('double');
  });
  it("tolère les cellules vides en FIN de ligne d'en-tête (artefact Excel)", () => {
    const res = parseTable(csv('Nom;Catégorie;Prix;;\nCastel;Bières;650;;\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(true);
    expect(res.rows[0].cells['Prix']).toBe('650');
  });
});
```

- [ ] **Step 2:** `npm test -- tests/unit/import-table.test.ts` → les 2 premiers FAIL (l'actuel filtre les vides silencieusement ; les doublons passent).

- [ ] **Step 3: Implémenter** — dans `src/lib/import-table.ts`, remplacer le bloc actuel

```ts
  const headerRow = rows[0].map((h) => String(h ?? '').trim()).filter((h) => h !== '');
  const byNormalized = new Map(expectedHeaders.map((h) => [normalizeText(h), h]));
  const mapping: string[] = []; // index de colonne -> en-tête canonique
  for (const h of headerRow) {
    const canonical = byNormalized.get(normalizeText(h));
    if (!canonical) return { ok: false, rows: [], error: `Colonne inconnue : « ${h} »` };
    mapping.push(canonical);
  }
```

par :

```ts
  // En-têtes durcis (spec durcissement §2) : les cellules vides en FIN de ligne sont
  // tolérées (artefact d'export Excel), mais une cellule vide AU MILIEU décalerait
  // silencieusement les colonnes de données -> rejet explicite. Doublons rejetés
  // (le second écraserait le premier dans `cells`).
  const headerRow = rows[0].map((h) => String(h ?? '').trim());
  while (headerRow.length && headerRow[headerRow.length - 1] === '') headerRow.pop();
  const byNormalized = new Map(expectedHeaders.map((h) => [normalizeText(h), h]));
  const mapping: string[] = []; // index de colonne -> en-tête canonique
  const seen = new Set<string>();
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i];
    if (h === '') {
      return { ok: false, rows: [], error: `Colonne d'en-tête vide (position ${i + 1})` };
    }
    const canonical = byNormalized.get(normalizeText(h));
    if (!canonical) return { ok: false, rows: [], error: `Colonne inconnue : « ${h} »` };
    if (seen.has(canonical)) return { ok: false, rows: [], error: `Colonne en double : « ${h} »` };
    seen.add(canonical);
    mapping.push(canonical);
  }
```

(La suite — contrôle des manquantes, boucle des données — est inchangée.)

- [ ] **Step 4:** `npm test -- tests/unit/import-table.test.ts` → tous verts (8). Full `npm test` → 157. `npx tsc --noEmit` propre.
- [ ] **Step 5: Commit** — `fix(imports): en-têtes vides au milieu et doublons rejetés par parseTable`

### Task 2: Plafond d'upload 4 Mo

**Files:**
- Modify: `src/lib/import-table.ts` (constante, ajout pur), `src/app/(protected)/admin/imports/actions.ts`, `src/app/(protected)/compta/imports/actions.ts`
- Test: `tests/unit/upload-limit.test.ts` (nouveau)

- [ ] **Step 1: Tests qui échouent** — créer `tests/unit/upload-limit.test.ts` (même approche de mock que tests/unit/admin-form-actions.test.ts) :

```ts
// Plafond d'upload : contrat des 3 actions (admin imports ×2, ventes caisse).
// Dépendances Next/session mockées ; les fichiers sont de vrais File en mémoire.
import { describe, it, expect, vi } from 'vitest';
import { MAX_UPLOAD_BYTES } from '@/lib/import-table';
import { importProductsAction, importArticlesAction } from '@/app/(protected)/admin/imports/actions';
import { uploadSalesAction } from '@/app/(protected)/compta/imports/actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/session', () => ({
  requireRole: vi.fn(async () => ({ userId: 1, role: 'admin', name: 'A', locationId: null })),
}));

const bigFile = () => new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'gros.csv', { type: 'text/csv' });
const fd = (file: File, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.set('file', file);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};

describe('plafond upload 4 Mo', () => {
  it('importProductsAction rejette un fichier trop gros', async () => {
    const state = await importProductsAction({}, fd(bigFile()));
    expect(state.error).toContain('volumineux');
  });
  it('importArticlesAction rejette un fichier trop gros', async () => {
    const state = await importArticlesAction({}, fd(bigFile()));
    expect(state.error).toContain('volumineux');
  });
  it('uploadSalesAction rejette un fichier trop gros', async () => {
    const state = await uploadSalesAction({}, fd(bigFile(), { serviceDate: '2026-07-13' }));
    expect(state.error).toContain('volumineux');
  });
  it("un petit fichier passe le plafond (l'erreur suivante vient du parseur, pas de la taille)", async () => {
    const small = new File(['pas un tableau'], 'petit.csv', { type: 'text/csv' });
    const state = await importProductsAction({}, fd(small));
    expect(state.error).toBeDefined();
    expect(state.error).not.toContain('volumineux');
  });
});
```

- [ ] **Step 2:** Run → FAIL (MAX_UPLOAD_BYTES non exporté). **Step 3: Implémenter :**

Dans `src/lib/import-table.ts` (ajout pur, près du haut du fichier) :

```ts
// Plafond d'upload des imports (la plateforme limite le corps de requête à ~4,5 Mo ;
// un catalogue réel fait quelques dizaines de Ko). Spec durcissement §3.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
```

Dans `src/app/(protected)/admin/imports/actions.ts` — importer `MAX_UPLOAD_BYTES` depuis '@/lib/import-table' et dans `runImport`, juste après le contrôle `if (!file || !file.size) …` :

```ts
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'Fichier trop volumineux (4 Mo maximum)' };
```

Dans `src/app/(protected)/compta/imports/actions.ts` — même import, même contrôle juste après `if (!file || !file.size) …` dans `uploadSalesAction`.

- [ ] **Step 4:** `npm test -- tests/unit/upload-limit.test.ts` → 4 verts. Full → 161. tsc propre.
- [ ] **Step 5: Commit** — `feat(imports): plafond d'upload 4 Mo sur les trois actions de fichier`

### Task 3: Garde active côté serveur (TDD)

**Files:**
- Modify: `src/lib/orders.ts` (createOrder), `src/lib/service-exits.ts` (recordServiceExit), `src/lib/adjustments.ts` (recordAdjustment) — chirurgical
- Test: `tests/integration/active-guard.test.ts` (nouveau)

Décision (notée en auto-révision de spec) : les messages EXISTANTS « Produit inconnu … » restent inchangés ; la garde ajoute un nouveau message `Produit désactivé : « X »`. Aucun test existant ne change.

- [ ] **Step 1: Tests qui échouent** — créer `tests/integration/active-guard.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder } from '@/lib/orders';
import { recordServiceExit } from '@/lib/service-exits';
import { recordAdjustment } from '@/lib/adjustments';

async function seedInactive(db: Awaited<ReturnType<typeof createTestDb>>) {
  const base = await seedBase(db);
  const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
  await saveProduct(db, {
    id: castel.id, name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650, active: false,
  });
  return { ...base, castelId: castel.id! };
}

describe('garde active côté serveur', () => {
  it('createOrder refuse un produit désactivé (message avec le nom)', async () => {
    const db = await createTestDb();
    const { bar, barman, castelId } = await seedInactive(db);
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: castelId, qtyRequested: 2 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Castel');
    expect(res.error).toContain('désactivé');
  });
  it('recordServiceExit refuse un produit désactivé', async () => {
    const db = await createTestDb();
    const { bar, barman, castelId } = await seedInactive(db);
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-13', createdBy: barman.id,
      lines: [{ productId: castelId, qty: 1 }],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('désactivé');
  });
  it('recordAdjustment refuse un produit désactivé', async () => {
    const db = await createTestDb();
    const { bar, admin, castelId } = await seedInactive(db);
    const res = await recordAdjustment(db, {
      productId: castelId, locationId: bar.id, qty: -1, reason: 'casse', userId: admin.id,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('désactivé');
  });
  it('un produit actif passe toujours (non-régression)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: riz.id!, qtyRequested: 3 }],
    });
    expect(res.ok).toBe(true);
  });
});
```

AVANT d'écrire : lire `src/lib/products.ts` pour vérifier que `saveProduct` avec `id` + `active: false` désactive bien (T8 de la phase précédente l'a confirmé : `active: input.active ?? true` écrit en update). Si le shape du seed diffère, adapter le helper du test, pas les assertions.

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** (chaque lib : élargir le select existant à `active` — et `name` là où il manque — puis une garde APRÈS le contrôle d'existence, AVANT toute écriture) :

`src/lib/orders.ts` — dans `createOrder`, remplacer le select d'existence par :

```ts
  const found = await db.select({ id: products.id, name: products.name, active: products.active })
    .from(products).where(inArray(products.id, productIds));
  if (found.length !== productIds.length) {
    return { ok: false, error: 'Produit inconnu dans la commande' };
  }
  // Garde serveur (spec durcissement §4) : l'UI filtre déjà les inactifs,
  // ceci bloque les POST forgés.
  const inactive = found.find((p: { active: boolean }) => !p.active);
  if (inactive) return { ok: false, error: `Produit désactivé : « ${inactive.name} »` };
```

`src/lib/service-exits.ts` — dans `recordServiceExit`, le select `found` inclut déjà `name` ; y ajouter `active: products.active` et insérer après le contrôle d'existence :

```ts
  const inactive = found.find((p: { active: boolean }) => !p.active);
  if (inactive) return { ok: false, error: `Produit désactivé : « ${inactive.name} »` };
```

`src/lib/adjustments.ts` — dans `recordAdjustment`, le produit est déjà chargé (lire le fichier : un select sur products avant les écritures). Ajouter `active` au select si absent, puis après le contrôle d'existence :

```ts
  if (!product.active) return { ok: false, error: `Produit désactivé : « ${product.name} »` };
```

(Adapter le nom de variable au code réel ; si `recordAdjustment` ne charge pas le produit aujourd'hui, élargir son select existant plutôt que d'ajouter une requête séparée.)

- [ ] **Step 4:** `npm test -- tests/integration/active-guard.test.ts` → 4 verts. Full → 165 (aucun existant cassé — les messages « Produit inconnu » n'ont pas bougé). tsc propre.
- [ ] **Step 5: Commit** — `feat(stock): garde serveur contre les écritures sur produit désactivé (TDD)`

### Task 4: Fraîcheur des sessions (TDD)

**Files:**
- Create: `src/lib/session-freshness.ts`
- Modify: `src/lib/session.ts` (requireRole)
- Test: `tests/integration/session-freshness.test.ts` (nouveau)

- [ ] **Step 1: Tests qui échouent** — créer `tests/integration/session-freshness.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { freshRoleIfAllowed } from '@/lib/session-freshness';
import { users } from '@/db/schema';

describe('freshRoleIfAllowed', () => {
  it('compte actif au bon rôle -> rôle frais', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    expect(await freshRoleIfAllowed(db, barman.id, ['barman'])).toBe('barman');
  });
  it('compte désactivé -> null, même avec un jeton encore valide', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    await db.update(users).set({ active: false }).where(eq(users.id, barman.id));
    expect(await freshRoleIfAllowed(db, barman.id, ['barman'])).toBeNull();
  });
  it('rôle rétrogradé en base -> null pour l\'accès admin (le jeton ne fait plus foi)', async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db);
    await db.update(users).set({ role: 'comptable' }).where(eq(users.id, admin.id));
    expect(await freshRoleIfAllowed(db, admin.id, ['admin'])).toBeNull();
    // …mais l'accès comptable, lui, est désormais permis :
    expect(await freshRoleIfAllowed(db, admin.id, ['comptable'])).toBe('comptable');
  });
  it('passe-droit admin conservé ; utilisateur inconnu -> null', async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db);
    expect(await freshRoleIfAllowed(db, admin.id, ['comptable'])).toBe('admin');
    expect(await freshRoleIfAllowed(db, 999999, ['admin'])).toBeNull();
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** `src/lib/session-freshness.ts` :

```ts
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import type { Role } from './auth';
import type { AnyDb } from '@/db';

// Le jeton JWT n'est qu'un identifiant authentifié : le rôle qui FAIT FOI est celui
// de la base (spec durcissement §5). Retourne le rôle frais si le compte est actif
// et autorisé pour `roles` (passe-droit admin conservé), null sinon.
// Module pur (sans next/*) pour être testable sur la base PGlite.
export async function freshRoleIfAllowed(
  db: AnyDb, userId: number, roles: Role[],
): Promise<Role | null> {
  const [u] = await db.select({ role: users.role, active: users.active })
    .from(users).where(eq(users.id, userId));
  if (!u || !u.active) return null;
  if (!roles.includes(u.role) && u.role !== 'admin') return null;
  return u.role;
}
```

Puis dans `src/lib/session.ts`, remplacer `requireRole` par :

```ts
import { db } from '@/db';
import { freshRoleIfAllowed } from './session-freshness';

// À appeler en tête de chaque Server Action / page protégée. Depuis le durcissement
// post-v1, le rôle est re-vérifié EN BASE à chaque appel : rétrogradation ou
// désactivation de compte prennent effet à la requête suivante (le proxy Edge, lui,
// reste un pré-filtre rapide par jeton). Tout refus -> retour au login.
export async function requireRole(roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  const fresh = await freshRoleIfAllowed(db, session.userId, roles);
  if (!fresh) redirect('/login');
  return { ...session, role: fresh };
}
```

(Les imports s'ajoutent en tête de fichier ; `getSession` et le reste ne changent pas. NOTE : l'ancien comportement « mauvais rôle → throw » devient « → redirect » — décision de spec §5.)

- [ ] **Step 4:** Full `npm test` → 169. tsc propre. `npm run build` (session.ts importe désormais @/db — vérifier que rien ne casse côté build ; le proxy n'importe PAS session.ts).
- [ ] **Step 5: Commit** — `feat(session): le rôle fait foi en base — rétrogradation et désactivation immédiates (TDD)`

### Task 5: AnyDb typé

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1:** Remplacer le bloc `AnyDb` :

```ts
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

// Union réelle des deux clients (prod Neon HTTP, tests PGlite) — remplace le `any`
// historique. Types effacés à la compilation ; @electric-sql/pglite est en devDeps,
// disponible pour tsc au build.
export type AnyDb = NeonHttpDatabase<typeof schema> | PgliteDatabase<typeof schema>;
```

- [ ] **Step 2:** `npx tsc --noEmit`. Si des erreurs apparaissent dans les libs : les corriger par un MEILLEUR typage local (annotations de résultats de select, génériques), jamais par `as any`. REPLI si l'union est inutilisable en pratique (erreurs d'incompatibilité de méthodes en cascade > ~10 fichiers) : `import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'` et `export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>` — noter le repli dans le commit. Si même le repli échoue structurellement : STATUS BLOCKED, ne pas forcer.
- [ ] **Step 3:** Full `npm test` → 169 (rien ne doit bouger à l'exécution). `npm run build` propre.
- [ ] **Step 4: Commit** — `refactor(db): AnyDb réellement typé (union Neon/PGlite)`

### Task 6: Export Mouvements CSV/Excel (TDD)

**Files:**
- Modify: `src/lib/movement-report.ts` (champs valorisés, ajout au type + calcul)
- Create: `src/lib/movement-export.ts`, `src/app/(protected)/compta/mouvements/export/route.ts`
- Modify: `src/app/(protected)/compta/mouvements/page.tsx` (liens Exporter, additif)
- Test: `tests/integration/movement-export.test.ts` (nouveau)

- [ ] **Step 1: Tests qui échouent** — créer `tests/integration/movement-export.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { getMovementReport } from '@/lib/movement-report';
import { buildMovementExport } from '@/lib/movement-export';
import { stockMovements } from '@/db/schema';

async function seedReport(db: Awaited<ReturnType<typeof createTestDb>>) {
  const { bar, barman, admin } = await seedBase(db);
  const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
  await db.insert(stockMovements).values([
    { productId: castel.id!, locationId: bar.id, type: 'reception' as const, qty: '10', userId: barman.id, createdAt: new Date('2026-02-10T10:00:00') },
    { productId: castel.id!, locationId: bar.id, type: 'reception' as const, qty: '2', userId: barman.id, createdAt: new Date('2026-03-05T10:00:00') },
    { productId: castel.id!, locationId: bar.id, type: 'sortie_service' as const, qty: '-0.4', userId: barman.id, createdAt: new Date('2026-03-10T22:00:00') },
    { productId: castel.id!, locationId: bar.id, type: 'ajustement_admin' as const, qty: '-1', userId: admin.id, createdAt: new Date('2026-03-15T11:00:00') },
  ]);
  return { bar };
}

describe('valorisation des mouvements', () => {
  it('receptionsValue/sortiesValue/ajustementsValue calculés au prix d\'achat (signés pour ajustements)', async () => {
    const db = await createTestDb();
    const { bar } = await seedReport(db);
    const [l] = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    expect(l.receptionsValue).toBe(1300);   // 2 × 650
    expect(l.sortiesValue).toBe(260);       // 0,4 × 650
    expect(l.ajustementsValue).toBe(-650);  // -1 × 650
  });
});

describe('buildMovementExport', () => {
  it('csv : BOM, en-têtes français, une ligne par produit avec emplacement, virgule décimale', async () => {
    const db = await createTestDb();
    const { bar } = await seedReport(db);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    const t = buildMovementExport([{ locationName: 'Bar', lines }], {
      format: 'csv', from: '2026-03-01', to: '2026-03-31',
    });
    expect(t.filename).toBe('mouvements-2026-03-01-2026-03-31.csv');
    expect(t.contentType).toContain('csv');
    const text = t.buffer.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = text.slice(1).trim().split('\n');
    expect(header).toBe('Emplacement;Produit;Unité;Stock initial;Réceptions;Sorties;Ajustements;Stock final;Valeur initiale (FCFA);Valeur réceptions (FCFA);Valeur sorties (FCFA);Valeur ajustements (FCFA);Valeur finale (FCFA)');
    expect(row).toBe('Bar;Castel;bouteille;10;2;0,4;-1;10,6;6500;1300;260;-650;6890');
  });
  it('xlsx : une feuille par emplacement, relisible', async () => {
    const db = await createTestDb();
    const { bar } = await seedReport(db);
    const lines = await getMovementReport(db, { from: '2026-03-01', to: '2026-03-31', locationId: bar.id });
    const t = buildMovementExport(
      [{ locationName: 'Bar', lines }, { locationName: 'Cuisine', lines: [] }],
      { format: 'xlsx', from: '2026-03-01', to: '2026-03-31' },
    );
    expect(t.filename).toBe('mouvements-2026-03-01-2026-03-31.xlsx');
    const wb = XLSX.read(t.buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Bar', 'Cuisine']);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Bar'], { header: 1 }) as unknown[][];
    expect(rows[0][0]).toBe('Produit');
    expect(rows[1][0]).toBe('Castel');
    expect(rows[1][6]).toBe(10.6); // Stock final numérique dans Excel
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter :**

Dans `src/lib/movement-report.ts` : ajouter à `MovementReportLine` les champs `receptionsValue: number; sortiesValue: number; ajustementsValue: number;` et dans le `.map()` final de `getMovementReport` :

```ts
        receptionsValue: Math.round(e.receptions * info.purchasePrice),
        sortiesValue: Math.round(e.sorties * info.purchasePrice),
        ajustementsValue: Math.round(e.ajustements * info.purchasePrice),
```

Créer `src/lib/movement-export.ts` :

```ts
import * as XLSX from 'xlsx';
import type { MovementReportLine } from './movement-report';

export interface MovementExportSection { locationName: string; lines: MovementReportLine[] }

const HEADERS = [
  'Produit', 'Unité', 'Stock initial', 'Réceptions', 'Sorties', 'Ajustements', 'Stock final',
  'Valeur initiale (FCFA)', 'Valeur réceptions (FCFA)', 'Valeur sorties (FCFA)',
  'Valeur ajustements (FCFA)', 'Valeur finale (FCFA)',
];

const nums = (l: MovementReportLine): number[] => [
  l.initial, l.receptions, l.sorties, l.ajustements, l.final,
  l.initialValue, l.receptionsValue, l.sortiesValue, l.ajustementsValue, l.finalValue,
];

// Export du rapport de mouvements (spec durcissement §7). CSV : BOM UTF-8, séparateur ;,
// virgule décimale (conventions templates), colonne Emplacement en tête. xlsx : une
// feuille par emplacement, valeurs numériques natives.
export function buildMovementExport(sections: MovementExportSection[], opts: {
  format: 'csv' | 'xlsx'; from: string; to: string;
}): { buffer: Buffer; filename: string; contentType: string } {
  const base = `mouvements-${opts.from}-${opts.to}`;
  if (opts.format === 'csv') {
    const fr = (n: number) => String(n).replace('.', ',');
    const rows = sections.flatMap((s) => s.lines.map((l) =>
      [s.locationName, l.name, l.baseUnit, ...nums(l).map(fr)].join(';')));
    const content = ['Emplacement;' + HEADERS.join(';'), ...rows].join('\n') + '\n';
    return {
      buffer: Buffer.from('﻿' + content, 'utf-8'),
      filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8',
    };
  }
  const wb = XLSX.utils.book_new();
  for (const s of sections) {
    const aoa = [HEADERS, ...s.lines.map((l) => [l.name, l.baseUnit, ...nums(l)])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), s.locationName.slice(0, 31));
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    buffer, filename: `${base}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
```

Créer `src/app/(protected)/compta/mouvements/export/route.ts` (mêmes règles de filtres que la page — duplication assumée et commentée, la page reste intouchée sur sa logique) :

```ts
import { NextRequest } from 'next/server';
import { asc, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { locations, recipeLines, saleArticles } from '@/db/schema';
import { getSession } from '@/lib/session';
import { isValidDateString } from '@/lib/dates';
import { getMovementReport } from '@/lib/movement-report';
import { buildMovementExport } from '@/lib/movement-export';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /compta/mouvements/export?format=csv|xlsx&du=…&au=…&emplacement=…&produit=…&article=…
// Mêmes défauts et mêmes règles de filtres que la page Mouvements (duplication assumée :
// la page est un composant serveur intouché, la logique tient en quelques lignes).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'comptable' && session.role !== 'admin')) {
    return new Response('Accès refusé', { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format');
  if (format !== 'csv' && format !== 'xlsx') {
    return new Response('Paramètres invalides', { status: 400 });
  }
  const now = new Date();
  const defaultDu = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultAu = toDateStr(now);
  let du = sp.get('du') && isValidDateString(sp.get('du')!) ? sp.get('du')! : defaultDu;
  let au = sp.get('au') && isValidDateString(sp.get('au')!) ? sp.get('au')! : defaultAu;
  if (du > au) { du = defaultDu; au = defaultAu; }

  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin')).orderBy(asc(locations.name));
  const emplacementId = Number(sp.get('emplacement'));
  const selected = locs.some((l) => l.id === emplacementId)
    ? locs.filter((l) => l.id === emplacementId) : locs;

  const produitId = Number(sp.get('produit'));
  const articleId = Number(sp.get('article'));
  let productIds: number[] | undefined;
  if (Number.isFinite(produitId) && produitId > 0) {
    productIds = [produitId];
  } else if (Number.isFinite(articleId) && articleId > 0) {
    const [art] = await db.select({ id: saleArticles.id }).from(saleArticles)
      .where(eq(saleArticles.id, articleId));
    if (art) {
      const lines = await db.select({ productId: recipeLines.productId })
        .from(recipeLines).where(eq(recipeLines.saleArticleId, art.id));
      productIds = [...new Set(lines.map((l) => l.productId))];
    }
  }

  const sections = await Promise.all(selected.map(async (loc) => ({
    locationName: loc.name,
    lines: await getMovementReport(db, { from: du, to: au, locationId: loc.id, productIds }),
  })));
  const t = buildMovementExport(sections, { format, from: du, to: au });
  return new Response(new Uint8Array(t.buffer), {
    headers: {
      'Content-Type': t.contentType,
      'Content-Disposition': `attachment; filename="${t.filename}"`,
    },
  });
}
```

Dans `src/app/(protected)/compta/mouvements/page.tsx` — juste APRÈS la `</Card>` du formulaire de filtres, ajouter (additif ; `baseQuery` existe déjà) :

```tsx
      <p className="text-sm text-muted">
        Exporter :{' '}
        <a href={`/compta/mouvements/export?${baseQuery.toString()}&format=csv`}
          className="text-action underline underline-offset-4">CSV</a>
        {' · '}
        <a href={`/compta/mouvements/export?${baseQuery.toString()}&format=xlsx`}
          className="text-action underline underline-offset-4">Excel</a>
      </p>
```

- [ ] **Step 4:** `npm test -- tests/integration/movement-export.test.ts` → 3 verts. Full → 172. tsc propre. `npm run build` (route `/compta/mouvements/export` visible).
- [ ] **Step 5: Commit** — `feat(compta): export CSV/Excel des mouvements avec valorisation complète (TDD)`

### Task 7: Outillage + balayage final

**Files:**
- Modify: `tests/unit/import-table.test.ts` (suppression du helper `xlsxBuf` inutilisé UNIQUEMENT), `eslint.config.mjs`, `README.md`

- [ ] **Step 1:** Dans `tests/unit/import-table.test.ts`, supprimer la fonction `xlsxBuf` (lignes du helper uniquement — les tests n'y touchent pas). Dans `eslint.config.mjs`, ajouter `".claude/**",` à la liste `globalIgnores` (avec un commentaire : `// Worktrees de sessions Claude (artefacts .next non lintables).`).
- [ ] **Step 2:** `npm run lint` (le VRAI, plus le balayage réduit) → 0 erreur, 0 warning attendu. `npm test` → **172 tests / 32 fichiers attendus** (154 + 3 + 4 + 4 + 4 + 3). `npx tsc --noEmit`, `npm run build` propres.
- [ ] **Step 3:** Vérifs ciblées : `git diff 0691b74..HEAD --stat -- tests/` → 4 nouveaux fichiers + import-table.test.ts (describe T1 + suppression helper T7), rien d'autre. Greps : `grep -rn "as any" src/lib src/db` → aucun NOUVEAU (comparer à `git grep "as any" 0691b74 -- src/`).
- [ ] **Step 4:** README : étendre la phrase comptable existante pour mentionner l'export CSV/Excel des mouvements. Diff minimal.
- [ ] **Step 5: Commit** — `chore: lint 0 warning (helper de test retiré, .claude ignoré) + README export`

---

## Auto-révision du plan

**Couverture spec :** §2 (T1 — vide milieu avec position, doublons, fin tolérée), §3 (T2 — constante + 3 actions + 4 tests), §4 (T3 — 3 libs, exclusions respectées : saveSaleArticle/inventaire/livraison intouchés), §5 (T4 — lib pure testée + requireRole rebranché, rôle de la base fait foi, passe-droit admin, redirect partout), §6 (T5 — union typée avec repli documenté), §7 (T6 — champs valorisés + export 2 formats + route + liens page, une feuille par emplacement, BOM/;/virgule), §8 (T7 — xlsxBuf, eslint ignore), §9 (tests couverts T1-T4/T6), §10-11 respectés. Le README (T7 Step 4) va au-delà de la spec — ajout mineur cohérent avec les phases précédentes.

**Points d'attention exécutant :**
- Comptes de tests indicatifs (154→157→161→165→169→169→172) ; invariant dur : aucun test existant MODIFIÉ (les describes ajoutés à import-table.test.ts et la suppression du helper sont autorisés par la spec).
- T3 : garder les messages « Produit inconnu … » existants tels quels ; la garde active est un NOUVEAU chemin d'erreur.
- T4 : session.ts importe désormais `db` — le PROXY ne doit toujours pas importer session.ts (vérifier ses imports : il utilise lib/auth uniquement).
- T4 : l'ancien `throw new Error('Accès refusé pour ce rôle')` disparaît au profit du redirect — vérifier par grep qu'aucun code ne catch ce message.
- T5 : repli PgDatabase documenté ; BLOCKED plutôt que `as any`.
- T6 : `sortiesValue` = valeur ABSOLUE (sorties est déjà absolu) ; `ajustementsValue` signé. Le test CSV fixe le format exact — implémenter pour le test, pas l'inverse.
- T6 : nom de feuille xlsx tronqué à 31 caractères (limite Excel).
- T7 : `npm run lint` doit passer À BLANC après l'ignore — si d'autres warnings surgissent hors .claude, les corriger s'ils viennent de cette phase, sinon les signaler.
