# Plan d'implémentation — Gestion de stock Restaurant-Bar (Skyview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Application web mobile-first de traçabilité des mouvements de stock (magasin → bar/cuisine), avec contrôle de cohérence entre ventes caisse et sorties déclarées.

**Architecture:** Une seule application Next.js (App Router) : pages React Server Components + Server Actions pour les mutations, Postgres (Neon) via Drizzle ORM. La logique métier vit dans `src/lib/` sous forme de fonctions pures ou prenant `db` en paramètre (testables avec PGlite, Postgres en mémoire). Le stock est calculé depuis un journal immuable de mouvements.

**Tech Stack:** Next.js (TypeScript, Tailwind), Drizzle ORM, Neon Postgres (`@neondatabase/serverless`), PGlite (tests), Vitest, bcryptjs, jose (sessions JWT en cookie httpOnly), xlsx (SheetJS, parse CSV/Excel).

**Spec de référence :** `docs/superpowers/specs/2026-07-11-gestion-stock-design.md`

---

## Structure des fichiers

```
src/
  db/
    schema.ts            # Tout le schéma Drizzle (tables + enums)
    index.ts             # Client DB production (Neon)
    seed.ts              # Seed : 3 emplacements + compte admin
  lib/
    units.ts             # Conversions conditionnement → unité de base (pur)
    auth.ts              # Hash mot de passe, création/lecture session JWT
    stock.ts             # Calcul du stock d'un emplacement depuis le journal (db)
    reconciliation.ts    # Consommation théorique + rapprochement (pur)
    sales-file.ts        # Parse des fichiers Excel/CSV de la caisse (pur)
  app/
    login/page.tsx + actions.ts
    (protected)/
      layout.tsx         # Navigation par rôle
      stock/page.tsx     # Stock de mon emplacement (barman/cuisinier)
      commandes/...      # Création + suivi commandes (barman/cuisinier)
      receptions/...     # Confirmation de réception (barman/cuisinier)
      sorties/...        # Sorties de fin de service (barman/cuisinier)
      inventaire/...     # Inventaire hebdo (barman/cuisinier)
      livraisons/...     # Commandes en attente + saisie livraison (magasinier)
      compta/...         # Dashboard, import ventes, rapprochement (comptable)
      admin/...          # Produits, articles de vente, utilisateurs, ajustements
  middleware.ts          # Garde d'authentification + rôles par préfixe d'URL
tests/
  helpers/db.ts          # DB PGlite migrée + seed minimal pour les tests
  unit/                  # units, reconciliation, sales-file, auth
  integration/           # stock, commandes→livraison→réception, sorties, inventaire, import
drizzle/                 # Migrations SQL générées par drizzle-kit
```

**Conventions transverses (valables pour toutes les tâches) :**
- Quantités : colonnes `numeric(12,3)`, converties en `number` via `Number()` à la lecture. Prix : `integer` (FCFA, pas de décimales).
- Toute Server Action commence par `requireRole([...])` (défini Tâche 7) qui relit la session côté serveur — jamais de confiance dans le client.
- Rien ne modifie jamais une ligne du journal `stock_movements` : uniquement des INSERT.
- Messages d'erreur en français, retournés sous forme `{ error: string }` par les actions.
- Commits fréquents, format `feat:`/`test:`/`chore:`.

---

## Phase 0 — Fondations

### Task 1: Scaffold du projet Next.js

**Files:**
- Create: projet Next.js à la racine `D:\Gestion_skyview` (le dossier contient déjà `docs/` et `.gitignore`)

- [ ] **Step 1: Générer le projet**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Répondre « No » si on propose d'écraser des fichiers existants autres que `.gitignore` (le `.gitignore` généré peut être fusionné : conserver les lignes existantes `.superpowers/`, `.vercel/`, `.env*`, `!.env.example`).

- [ ] **Step 2: Installer les dépendances**

```bash
npm install drizzle-orm @neondatabase/serverless bcryptjs jose xlsx
npm install -D drizzle-kit vitest @electric-sql/pglite @types/bcryptjs
```

- [ ] **Step 3: Vérifier que l'app démarre**

Run: `npm run dev` puis ouvrir http://localhost:3000
Expected: page d'accueil Next.js par défaut. Arrêter le serveur.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + dépendances (drizzle, vitest, pglite, xlsx)"
```

### Task 2: Configuration Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`)

- [ ] **Step 1: Créer la config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

- [ ] **Step 2: Ajouter le script dans package.json**

Dans `"scripts"` : `"test": "vitest run"` et `"test:watch": "vitest"`.

- [ ] **Step 3: Test sanité**

```ts
// tests/unit/sanity.test.ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('vitest fonctionne', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json tests/
git commit -m "chore: config vitest"
```

### Task 3: Schéma Drizzle complet + migrations + harnais de test PGlite

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`
- Create: `drizzle.config.ts`
- Create: `tests/helpers/db.ts`
- Test: `tests/integration/schema.test.ts`

- [ ] **Step 1: Écrire le schéma complet**

```ts
// src/db/schema.ts
import {
  pgTable, serial, text, integer, boolean, numeric,
  timestamp, date, pgEnum,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', [
  'admin', 'magasinier', 'barman', 'cuisinier', 'comptable',
]);
export const locationTypeEnum = pgEnum('location_type', ['magasin', 'bar', 'cuisine']);
export const orderStatusEnum = pgEnum('order_status', ['en_attente', 'livree', 'receptionnee']);
export const movementTypeEnum = pgEnum('movement_type', [
  'reception', 'sortie_service', 'ajustement_inventaire', 'ajustement_admin',
]);
export const inventoryStatusEnum = pgEnum('inventory_status', ['brouillon', 'valide']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  active: boolean('active').notNull().default(true),
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: locationTypeEnum('type').notNull().unique(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  baseUnit: text('base_unit').notNull(),          // ex. "bouteille", "kg", "L"
  packName: text('pack_name'),                     // ex. "casier" (optionnel)
  packSize: numeric('pack_size', { precision: 12, scale: 3 }), // ex. 12
  purchasePrice: integer('purchase_price').notNull().default(0), // FCFA / unité de base
  alertThreshold: numeric('alert_threshold', { precision: 12, scale: 3 }), // par emplacement
  active: boolean('active').notNull().default(true),
});

export const saleArticles = pgTable('sale_articles', {
  id: serial('id').primaryKey(),
  cashName: text('cash_name').notNull().unique(), // nom exact dans l'export caisse
  locationId: integer('location_id').notNull().references(() => locations.id),
});

export const recipeLines = pgTable('recipe_lines', {
  id: serial('id').primaryKey(),
  saleArticleId: integer('sale_article_id').notNull()
    .references(() => saleArticles.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(), // en unité de base
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => locations.id),
  createdBy: integer('created_by').notNull().references(() => users.id),
  deliveredBy: integer('delivered_by').references(() => users.id),
  receivedBy: integer('received_by').references(() => users.id),
  status: orderStatusEnum('status').notNull().default('en_attente'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at'),
  receivedAt: timestamp('received_at'),
});

export const orderLines = pgTable('order_lines', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qtyRequested: numeric('qty_requested', { precision: 12, scale: 3 }).notNull(),
  qtyDelivered: numeric('qty_delivered', { precision: 12, scale: 3 }),
  qtyReceived: numeric('qty_received', { precision: 12, scale: 3 }),
});

// Journal immuable : le stock d'un emplacement = somme des qty par produit.
export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  locationId: integer('location_id').notNull().references(() => locations.id),
  type: movementTypeEnum('type').notNull(),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(), // signée : + entrée, - sortie
  refType: text('ref_type'),   // 'order' | 'service_exit' | 'inventory' | null
  refId: integer('ref_id'),
  reason: text('reason'),      // obligatoire pour ajustement_admin
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const serviceExits = pgTable('service_exits', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => locations.id),
  serviceDate: date('service_date').notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const serviceExitLines = pgTable('service_exit_lines', {
  id: serial('id').primaryKey(),
  serviceExitId: integer('service_exit_id').notNull()
    .references(() => serviceExits.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(), // positive à la saisie
});

export const inventories = pgTable('inventories', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => locations.id),
  inventoryDate: date('inventory_date').notNull(),
  countedBy: integer('counted_by').notNull().references(() => users.id),
  status: inventoryStatusEnum('status').notNull().default('brouillon'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const inventoryLines = pgTable('inventory_lines', {
  id: serial('id').primaryKey(),
  inventoryId: integer('inventory_id').notNull()
    .references(() => inventories.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qtyTheoretical: numeric('qty_theoretical', { precision: 12, scale: 3 }).notNull(),
  qtyCounted: numeric('qty_counted', { precision: 12, scale: 3 }).notNull(),
});

export const salesImports = pgTable('sales_imports', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  serviceDate: date('service_date').notNull(), // journée de service couverte
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const salesImportLines = pgTable('sales_import_lines', {
  id: serial('id').primaryKey(),
  importId: integer('import_id').notNull()
    .references(() => salesImports.id, { onDelete: 'cascade' }),
  articleNameRaw: text('article_name_raw').notNull(), // tel que lu dans le fichier
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
  saleArticleId: integer('sale_article_id').references(() => saleArticles.id), // null = non reconnu
});
```

- [ ] **Step 2: Client DB production et config drizzle-kit**

```ts
// src/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
export type Db = typeof db;
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://placeholder' },
});
```

Note : les fonctions métier acceptent un paramètre `db` typé large (`AnyDb`, voir Step 3) pour fonctionner à la fois avec Neon (prod) et PGlite (tests).

- [ ] **Step 3: Harnais de test PGlite**

```ts
// tests/helpers/db.ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';

// Type "large" accepté par toutes les fonctions métier (Neon ou PGlite).
export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

// Seed minimal réutilisable : 3 emplacements + un utilisateur par rôle.
export async function seedBase(db: TestDb) {
  const [magasin, bar, cuisine] = await db.insert(schema.locations).values([
    { name: 'Magasin', type: 'magasin' },
    { name: 'Bar', type: 'bar' },
    { name: 'Cuisine', type: 'cuisine' },
  ]).returning();
  const [admin, magasinier, barman, cuisinier, comptable] =
    await db.insert(schema.users).values([
      { name: 'Admin', username: 'admin', passwordHash: 'x', role: 'admin' },
      { name: 'Mag', username: 'mag', passwordHash: 'x', role: 'magasinier' },
      { name: 'Bar', username: 'bar', passwordHash: 'x', role: 'barman' },
      { name: 'Cuis', username: 'cuis', passwordHash: 'x', role: 'cuisinier' },
      { name: 'Compta', username: 'compta', passwordHash: 'x', role: 'comptable' },
    ]).returning();
  return { magasin, bar, cuisine, admin, magasinier, barman, cuisinier, comptable };
}
```

Dans `src/db/index.ts`, ajouter à la fin le type commun utilisé par les fonctions métier :

```ts
// Accepte le client Neon comme le client PGlite des tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = any;
```

(Compromis assumé : Drizzle ne fournit pas de type commun entre drivers ; les fonctions métier prennent `AnyDb` et la sécurité de type vient du schéma partagé.)

- [ ] **Step 4: Générer la migration**

Run: `npx drizzle-kit generate --name init`
Expected: un fichier SQL dans `drizzle/` créant toutes les tables.

- [ ] **Step 5: Test — le schéma migre et accepte les écritures de base**

```ts
// tests/integration/schema.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { products } from '@/db/schema';

describe('schéma', () => {
  it('migre sur PGlite et accepte le seed de base', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    expect(bar.type).toBe('bar');
    const [p] = await db.insert(products).values({
      name: 'Castel 65cl', baseUnit: 'bouteille',
      packName: 'casier', packSize: '12', purchasePrice: 650,
    }).returning();
    expect(p.id).toBeGreaterThan(0);
    expect(Number(p.packSize)).toBe(12);
  });
});
```

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/ drizzle.config.ts drizzle/ tests/
git commit -m "feat: schéma complet Drizzle + migrations + harnais de test PGlite"
```

### Task 4: Seed production (emplacements + admin)

**Files:**
- Create: `src/db/seed.ts`
- Modify: `package.json` (script `db:seed`)

- [ ] **Step 1: Écrire le seed**

```ts
// src/db/seed.ts — usage : DATABASE_URL=... ADMIN_PASSWORD=... npx tsx src/db/seed.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import bcrypt from 'bcryptjs';
import * as schema from './schema';

async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  await db.insert(schema.locations).values([
    { name: 'Magasin', type: 'magasin' },
    { name: 'Bar', type: 'bar' },
    { name: 'Cuisine', type: 'cuisine' },
  ]).onConflictDoNothing();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD requis');
  await db.insert(schema.users).values({
    name: 'Administrateur', username: 'admin',
    passwordHash: await bcrypt.hash(password, 10), role: 'admin',
  }).onConflictDoNothing();
  console.log('Seed OK');
}
main();
```

- [ ] **Step 2: Ajouter les scripts**

```bash
npm install -D tsx
```

Dans `package.json` scripts : `"db:seed": "tsx src/db/seed.ts"`, `"db:migrate": "drizzle-kit migrate"`, `"db:generate": "drizzle-kit generate"`.

- [ ] **Step 3: Commit**

```bash
git add src/db/seed.ts package.json package-lock.json
git commit -m "feat: seed emplacements + admin"
```

### Task 5: Conversions d'unités (lib pure, TDD)

**Files:**
- Create: `src/lib/units.ts`
- Test: `tests/unit/units.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/unit/units.test.ts
import { describe, it, expect } from 'vitest';
import { round3, packsToBase, totalBase } from '@/lib/units';

describe('units', () => {
  it('convertit des conditionnements en unités de base', () => {
    expect(packsToBase(3, 12)).toBe(36);
    expect(packsToBase(0.5, 12)).toBe(6);
  });
  it('arrondit à 3 décimales (pas de dérive flottante)', () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
    expect(packsToBase(0.1, 3)).toBe(0.3);
  });
  it('totalBase = packs convertis + unités saisies directement', () => {
    // le magasinier livre 2 casiers + 5 bouteilles à l'unité
    expect(totalBase({ packs: 2, units: 5, packSize: 12 })).toBe(29);
    // produit sans conditionnement : les packs sont ignorés
    expect(totalBase({ packs: 2, units: 5, packSize: null })).toBe(5);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- tests/unit/units.test.ts`
Expected: FAIL (module `@/lib/units` introuvable)

- [ ] **Step 3: Implémenter**

```ts
// src/lib/units.ts
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function packsToBase(packs: number, packSize: number): number {
  return round3(packs * packSize);
}

export function totalBase(input: { packs: number; units: number; packSize: number | null }): number {
  const fromPacks = input.packSize ? packsToBase(input.packs, input.packSize) : 0;
  return round3(fromPacks + input.units);
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npm test -- tests/unit/units.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts tests/unit/units.test.ts
git commit -m "feat: conversions conditionnement -> unité de base"
```

### Task 6: Auth — hash et sessions JWT (TDD)

**Files:**
- Create: `src/lib/auth.ts`
- Test: `tests/unit/auth.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/unit/auth.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '@/lib/auth';

process.env.SESSION_SECRET = 'test-secret-au-moins-32-caracteres!!';

describe('auth', () => {
  it('hache et vérifie un mot de passe', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
    expect(await verifyPassword('mauvais', hash)).toBe(false);
  });
  it('crée et vérifie un jeton de session', async () => {
    const token = await createSessionToken({ userId: 1, role: 'barman', name: 'Bar', locationId: 2 });
    const session = await verifySessionToken(token);
    expect(session).toMatchObject({ userId: 1, role: 'barman', locationId: 2 });
  });
  it('rejette un jeton falsifié', async () => {
    expect(await verifySessionToken('n.importe.quoi')).toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- tests/unit/auth.test.ts`
Expected: FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/auth.ts
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'magasinier' | 'barman' | 'cuisinier' | 'comptable';

export interface Session {
  userId: number;
  role: Role;
  name: string;
  locationId: number | null; // bar ou cuisine pour barman/cuisinier, sinon null
}

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as number,
      role: payload.role as Role,
      name: payload.name as string,
      locationId: (payload.locationId as number | null) ?? null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npm test -- tests/unit/auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/unit/auth.test.ts
git commit -m "feat: auth (bcrypt + sessions JWT jose)"
```

### Task 7: Login, cookie de session, middleware de rôles

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/actions.ts`
- Create: `src/lib/session.ts` (lecture cookie côté serveur + `requireRole`)
- Create: `src/middleware.ts`

- [ ] **Step 1: Helpers de session côté serveur**

```ts
// src/lib/session.ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, type Session, type Role } from './auth';

export const SESSION_COOKIE = 'skyview_session';

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// À appeler en tête de chaque Server Action / page protégée.
export async function requireRole(roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role) && session.role !== 'admin') {
    throw new Error('Accès refusé pour ce rôle');
  }
  return session;
}
```

- [ ] **Step 2: Action de connexion**

```ts
// src/app/login/actions.ts
'use server';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { users, locations } from '@/db/schema';
import { verifyPassword, createSessionToken } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/session';

const HOME_BY_ROLE: Record<string, string> = {
  admin: '/admin/produits', magasinier: '/livraisons',
  barman: '/stock', cuisinier: '/stock', comptable: '/compta',
};

export async function login(_prev: { error?: string }, formData: FormData) {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: 'Identifiant ou mot de passe incorrect' };
  }
  let locationId: number | null = null;
  if (user.role === 'barman' || user.role === 'cuisinier') {
    const type = user.role === 'barman' ? 'bar' : 'cuisine';
    const [loc] = await db.select().from(locations).where(eq(locations.type, type));
    locationId = loc?.id ?? null;
  }
  const token = await createSessionToken({
    userId: user.id, role: user.role, name: user.name, locationId,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 12 * 3600,
  });
  redirect(HOME_BY_ROLE[user.role] ?? '/stock');
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
```

- [ ] **Step 3: Page de login (mobile-first)**

```tsx
// src/app/login/page.tsx
'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-gray-50">
      <form action={action} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-xl font-bold text-center">Skyview — Gestion de stock</h1>
        <input name="username" placeholder="Identifiant" autoComplete="username"
          className="w-full border rounded-lg p-3 text-lg" required />
        <input name="password" type="password" placeholder="Mot de passe" autoComplete="current-password"
          className="w-full border rounded-lg p-3 text-lg" required />
        {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
        <button disabled={pending}
          className="w-full bg-indigo-600 text-white rounded-lg p-3 text-lg font-semibold disabled:opacity-50">
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Middleware de protection par préfixe**

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, type Role } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/session';

// Préfixe d'URL -> rôles autorisés (admin passe partout).
const RULES: Array<[string, Role[]]> = [
  ['/admin', ['admin']],
  ['/compta', ['comptable']],
  ['/livraisons', ['magasinier']],
  ['/stock', ['barman', 'cuisinier']],
  ['/commandes', ['barman', 'cuisinier']],
  ['/receptions', ['barman', 'cuisinier']],
  ['/sorties', ['barman', 'cuisinier']],
  ['/inventaire', ['barman', 'cuisinier']],
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = RULES.find(([prefix]) => pathname.startsWith(prefix));
  if (!rule) return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  if (session.role !== 'admin' && !rule[1].includes(session.role)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/compta/:path*', '/livraisons/:path*', '/stock/:path*',
    '/commandes/:path*', '/receptions/:path*', '/sorties/:path*', '/inventaire/:path*'],
};
```

Et rediriger la racine : dans `src/app/page.tsx`, remplacer le contenu par :

```tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/login'); }
```

- [ ] **Step 5: Vérification manuelle**

Prérequis : une base Neon accessible (`DATABASE_URL` dans `.env.local`, avec `SESSION_SECRET` — 32+ caractères aléatoires), migrations appliquées (`npm run db:migrate`) et seed exécuté (`ADMIN_PASSWORD=... npm run db:seed`).
Run: `npm run dev` → http://localhost:3000 → redirigé vers /login → connexion admin → arrive sur /admin/produits (404 pour l'instant, normal : la page vient en Tâche 9). Mauvais mot de passe → message d'erreur.

- [ ] **Step 6: Commit**

```bash
git add src/app/login/ src/lib/session.ts src/middleware.ts src/app/page.tsx
git commit -m "feat: login, session cookie, middleware de rôles"
```

### Task 8: Layout protégé + navigation par rôle

**Files:**
- Create: `src/app/(protected)/layout.tsx`
- Modify: `src/app/layout.tsx` (lang fr, titre)

Note : toutes les pages métier des tâches suivantes vivent sous `src/app/(protected)/` — le groupe de route ajoute la navigation sans changer les URLs.

- [ ] **Step 1: Layout racine**

Dans `src/app/layout.tsx`, mettre `lang="fr"` sur `<html>` et `title: 'Skyview — Gestion de stock'` dans `metadata`. Ajouter dans le `<head>` via metadata : `viewport` par défaut de Next suffit.

- [ ] **Step 2: Layout protégé avec navigation**

```tsx
// src/app/(protected)/layout.tsx
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { logout } from '@/app/login/actions';

const NAV: Record<string, Array<{ href: string; label: string }>> = {
  magasinier: [{ href: '/livraisons', label: '📦 Livraisons' }],
  barman: [
    { href: '/stock', label: '📊 Stock' },
    { href: '/commandes', label: '🛒 Commandes' },
    { href: '/receptions', label: '📥 Réceptions' },
    { href: '/sorties', label: '🌙 Sorties' },
    { href: '/inventaire', label: '📋 Inventaire' },
  ],
  comptable: [
    { href: '/compta', label: '📊 Tableau de bord' },
    { href: '/compta/imports', label: '📤 Ventes caisse' },
    { href: '/compta/rapprochements', label: '⚖️ Rapprochements' },
  ],
  admin: [
    { href: '/admin/produits', label: '📦 Produits' },
    { href: '/admin/articles', label: '🧾 Articles' },
    { href: '/admin/utilisateurs', label: '👤 Utilisateurs' },
    { href: '/admin/ajustements', label: '🔧 Ajustements' },
  ],
};
NAV.cuisinier = NAV.barman;

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const items = NAV[session.role] ?? [];
  return (
    <div className="min-h-dvh bg-gray-50 pb-20">
      <header className="bg-indigo-700 text-white p-3 flex justify-between items-center sticky top-0 z-10">
        <span className="font-bold">Skyview</span>
        <form action={logout}>
          <button className="text-sm underline">{session.name} — Déconnexion</button>
        </form>
      </header>
      <main className="p-3 max-w-3xl mx-auto">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex justify-around p-1 z-10">
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className="flex-1 text-center text-xs py-2 rounded hover:bg-indigo-50">
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

(Barre de navigation en bas d'écran : standard mobile, accessible au pouce. L'admin ayant accès à tout, sa nav liste ses écrans propres ; il atteint les autres par URL.)

- [ ] **Step 3: Vérification manuelle**

Run: `npm run dev`, se connecter → header + nav visibles.

- [ ] **Step 4: Commit**

```bash
git add src/app/
git commit -m "feat: layout protégé + navigation mobile par rôle"
```

---

## Phase 1 — Référentiel (admin)

### Task 9: CRUD Produits

**Files:**
- Create: `src/app/(protected)/admin/produits/page.tsx`
- Create: `src/app/(protected)/admin/produits/actions.ts`
- Test: `tests/integration/products.test.ts`

- [ ] **Step 1: Test de la logique d'enregistrement (échoue)**

La logique de validation vit dans une fonction testable `saveProduct(db, input)` exportée par un module partagé, l'action serveur ne faisant que l'appeler après `requireRole`.

```ts
// tests/integration/products.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';

describe('saveProduct', () => {
  it('crée un produit avec conditionnement', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const res = await saveProduct(db, {
      name: 'Castel 65cl', category: 'Bière', baseUnit: 'bouteille',
      packName: 'casier', packSize: 12, purchasePrice: 650, alertThreshold: 24,
    });
    expect(res.ok).toBe(true);
  });
  it('refuse un prix négatif et un nom vide', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await saveProduct(db, { name: '', baseUnit: 'kg', purchasePrice: 100 })).ok).toBe(false);
    expect((await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: -5 })).ok).toBe(false);
  });
  it('met à jour un produit existant via id', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const created = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const updated = await saveProduct(db, { id: created.id, name: 'Riz parfumé', baseUnit: 'kg', purchasePrice: 600 });
    expect(updated.ok).toBe(true);
    expect(updated.id).toBe(created.id);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/products.test.ts` → FAIL

- [ ] **Step 3: Implémenter la lib**

```ts
// src/lib/products.ts
import { eq } from 'drizzle-orm';
import { products } from '@/db/schema';
import type { AnyDb } from '@/db';

export interface ProductInput {
  id?: number;
  name: string;
  category?: string;
  baseUnit: string;
  packName?: string | null;
  packSize?: number | null;
  purchasePrice: number;
  alertThreshold?: number | null;
  active?: boolean;
}

export async function saveProduct(db: AnyDb, input: ProductInput):
  Promise<{ ok: boolean; id?: number; error?: string }> {
  if (!input.name?.trim()) return { ok: false, error: 'Le nom est obligatoire' };
  if (!input.baseUnit?.trim()) return { ok: false, error: "L'unité de base est obligatoire" };
  if (input.purchasePrice < 0) return { ok: false, error: 'Le prix ne peut pas être négatif' };
  if ((input.packName && !input.packSize) || (!input.packName && input.packSize)) {
    return { ok: false, error: 'Conditionnement : renseigner le nom ET la taille' };
  }
  if (input.packSize != null && input.packSize <= 0) {
    return { ok: false, error: 'La taille du conditionnement doit être positive' };
  }
  const values = {
    name: input.name.trim(),
    category: input.category?.trim() ?? '',
    baseUnit: input.baseUnit.trim(),
    packName: input.packName?.trim() || null,
    packSize: input.packSize != null ? String(input.packSize) : null,
    purchasePrice: Math.round(input.purchasePrice),
    alertThreshold: input.alertThreshold != null ? String(input.alertThreshold) : null,
    active: input.active ?? true,
  };
  if (input.id) {
    await db.update(products).set(values).where(eq(products.id, input.id));
    return { ok: true, id: input.id };
  }
  const [row] = await db.insert(products).values(values).returning();
  return { ok: true, id: row.id };
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/products.test.ts` → PASS

- [ ] **Step 5: Action serveur + page**

```ts
// src/app/(protected)/admin/produits/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { saveProduct } from '@/lib/products';

export async function saveProductAction(_prev: { error?: string }, formData: FormData) {
  await requireRole(['admin']);
  const num = (k: string) => formData.get(k) ? Number(formData.get(k)) : null;
  const res = await saveProduct(db, {
    id: num('id') ?? undefined,
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? ''),
    baseUnit: String(formData.get('baseUnit') ?? ''),
    packName: String(formData.get('packName') ?? '') || null,
    packSize: num('packSize'),
    purchasePrice: num('purchasePrice') ?? 0,
    alertThreshold: num('alertThreshold'),
    active: formData.get('active') !== 'off',
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/produits');
  return {};
}
```

```tsx
// src/app/(protected)/admin/produits/page.tsx
import { db } from '@/db';
import { products } from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { ProductForm } from './product-form';

export const dynamic = 'force-dynamic';

export default async function ProduitsPage() {
  await requireRole(['admin']);
  const rows = await db.select().from(products).orderBy(asc(products.name));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Produits</h1>
      <ProductForm />
      <ul className="divide-y bg-white rounded-xl shadow">
        {rows.map((p) => (
          <li key={p.id} className="p-3 text-sm flex justify-between">
            <span>
              <b>{p.name}</b> {!p.active && <em className="text-gray-400">(inactif)</em>}
              <br />
              <span className="text-gray-500">
                {p.baseUnit}{p.packName ? ` — ${p.packName} de ${Number(p.packSize)}` : ''} — {p.purchasePrice} FCFA
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/admin/produits/product-form.tsx
'use client';
import { useActionState } from 'react';
import { saveProductAction } from './actions';

export function ProductForm() {
  const [state, action, pending] = useActionState(saveProductAction, {});
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-2 text-sm">
      <input name="name" placeholder="Nom du produit *" className="border rounded p-2 col-span-2" required />
      <input name="category" placeholder="Catégorie" className="border rounded p-2" />
      <input name="baseUnit" placeholder="Unité de base * (bouteille, kg…)" className="border rounded p-2" required />
      <input name="packName" placeholder="Conditionnement (casier…)" className="border rounded p-2" />
      <input name="packSize" type="number" step="0.001" placeholder="Taille (12)" className="border rounded p-2" />
      <input name="purchasePrice" type="number" placeholder="Prix d'achat FCFA *" className="border rounded p-2" required />
      <input name="alertThreshold" type="number" step="0.001" placeholder="Seuil d'alerte" className="border rounded p-2" />
      {state.error && <p className="text-red-600 col-span-2">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 col-span-2 font-semibold">
        Enregistrer
      </button>
    </form>
  );
}
```

(Modification d'un produit existant : hors v1 de cet écran, l'admin désactive/recrée ; l'édition inline pourra être ajoutée plus tard — `saveProduct` la supporte déjà via `id`.)

- [ ] **Step 6: Vérification manuelle** — créer « Castel 65cl » avec casier de 12 → apparaît dans la liste.

- [ ] **Step 7: Commit**

```bash
git add src/lib/products.ts src/app/\(protected\)/admin/produits/ tests/integration/products.test.ts
git commit -m "feat: CRUD produits (admin)"
```

### Task 10: CRUD Utilisateurs

**Files:**
- Create: `src/lib/users.ts`
- Create: `src/app/(protected)/admin/utilisateurs/page.tsx`, `actions.ts`, `user-form.tsx`
- Test: `tests/integration/users.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/users.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { createUser } from '@/lib/users';
import { verifyPassword } from '@/lib/auth';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('createUser', () => {
  it('crée un utilisateur avec mot de passe haché', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const res = await createUser(db, {
      name: 'Paul', username: 'paul', password: 'motdepasse1', role: 'barman',
    });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.username, 'paul'));
    expect(await verifyPassword('motdepasse1', row.passwordHash)).toBe(true);
  });
  it('refuse un identifiant déjà pris et un mot de passe trop court', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await createUser(db, { name: 'X', username: 'admin', password: 'motdepasse1', role: 'barman' })).ok).toBe(false);
    expect((await createUser(db, { name: 'X', username: 'nouveau', password: 'abc', role: 'barman' })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/users.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/users.ts
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { hashPassword, type Role } from './auth';
import type { AnyDb } from '@/db';

export async function createUser(db: AnyDb, input: {
  name: string; username: string; password: string; role: Role;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.name.trim() || !input.username.trim()) {
    return { ok: false, error: 'Nom et identifiant obligatoires' };
  }
  if (input.password.length < 8) {
    return { ok: false, error: 'Mot de passe : 8 caractères minimum' };
  }
  const [existing] = await db.select().from(users)
    .where(eq(users.username, input.username.trim().toLowerCase()));
  if (existing) return { ok: false, error: 'Cet identifiant est déjà utilisé' };
  await db.insert(users).values({
    name: input.name.trim(),
    username: input.username.trim().toLowerCase(),
    passwordHash: await hashPassword(input.password),
    role: input.role,
  });
  return { ok: true };
}

export async function setUserActive(db: AnyDb, userId: number, active: boolean) {
  await db.update(users).set({ active }).where(eq(users.id, userId));
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/users.test.ts` → PASS

- [ ] **Step 5: Action + page**

```ts
// src/app/(protected)/admin/utilisateurs/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { createUser, setUserActive } from '@/lib/users';
import type { Role } from '@/lib/auth';

export async function createUserAction(_prev: { error?: string }, formData: FormData) {
  await requireRole(['admin']);
  const res = await createUser(db, {
    name: String(formData.get('name') ?? ''),
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
    role: String(formData.get('role')) as Role,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/utilisateurs');
  return {};
}

export async function toggleUserAction(formData: FormData) {
  await requireRole(['admin']);
  await setUserActive(db, Number(formData.get('userId')), formData.get('active') === 'true');
  revalidatePath('/admin/utilisateurs');
}
```

```tsx
// src/app/(protected)/admin/utilisateurs/page.tsx
import { db } from '@/db';
import { users } from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { UserForm } from './user-form';
import { toggleUserAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function UtilisateursPage() {
  await requireRole(['admin']);
  const rows = await db.select().from(users).orderBy(asc(users.role), asc(users.name));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Utilisateurs</h1>
      <UserForm />
      <ul className="divide-y bg-white rounded-xl shadow">
        {rows.map((u) => (
          <li key={u.id} className="p-3 text-sm flex justify-between items-center">
            <span><b>{u.name}</b> ({u.username}) — {u.role}
              {!u.active && <em className="text-gray-400"> — désactivé</em>}</span>
            <form action={toggleUserAction}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="active" value={String(!u.active)} />
              <button className="text-xs underline text-indigo-600">
                {u.active ? 'Désactiver' : 'Réactiver'}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/admin/utilisateurs/user-form.tsx
'use client';
import { useActionState } from 'react';
import { createUserAction } from './actions';

export function UserForm() {
  const [state, action, pending] = useActionState(createUserAction, {});
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-2 text-sm">
      <input name="name" placeholder="Nom complet *" className="border rounded p-2" required />
      <input name="username" placeholder="Identifiant *" className="border rounded p-2" required />
      <input name="password" type="password" placeholder="Mot de passe * (8+ car.)" className="border rounded p-2" required />
      <select name="role" className="border rounded p-2" required>
        <option value="magasinier">Magasinier</option>
        <option value="barman">Barman</option>
        <option value="cuisinier">Cuisinier</option>
        <option value="comptable">Comptable</option>
        <option value="admin">Admin</option>
      </select>
      {state.error && <p className="text-red-600 col-span-2">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 col-span-2 font-semibold">
        Créer le compte
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — créer un barman, se déconnecter, se connecter avec → arrive sur /stock (404 pour l'instant, normal).

- [ ] **Step 7: Commit**

```bash
git add src/lib/users.ts src/app/\(protected\)/admin/utilisateurs/ tests/integration/users.test.ts
git commit -m "feat: gestion des utilisateurs (admin)"
```

### Task 11: Articles de vente + fiches techniques

**Files:**
- Create: `src/lib/sale-articles.ts`
- Create: `src/app/(protected)/admin/articles/page.tsx`, `actions.ts`, `article-form.tsx`
- Test: `tests/integration/sale-articles.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/sale-articles.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { saveSaleArticle, getRecipeMap } from '@/lib/sale-articles';

describe('articles de vente', () => {
  it('crée un article avec sa fiche technique', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const whisky = await saveProduct(db, { name: 'Whisky Black (L)', baseUnit: 'L', purchasePrice: 12000 });
    const res = await saveSaleArticle(db, {
      cashName: 'Whisky (verre)', locationId: bar.id,
      lines: [{ productId: whisky.id!, qty: 0.04 }],
    });
    expect(res.ok).toBe(true);
    const map = await getRecipeMap(db);
    expect(map.get(res.id!)).toEqual([{ productId: whisky.id, qty: 0.04 }]);
  });
  it('refuse une fiche vide ou une quantité nulle', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    expect((await saveSaleArticle(db, { cashName: 'X', locationId: bar.id, lines: [] })).ok).toBe(false);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await saveSaleArticle(db, {
      cashName: 'Y', locationId: bar.id, lines: [{ productId: p.id!, qty: 0 }],
    })).ok).toBe(false);
  });
  it('remplace la fiche à la mise à jour (pas de doublons de lignes)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const created = await saveSaleArticle(db, {
      cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: p.id!, qty: 1 }],
    });
    await saveSaleArticle(db, {
      id: created.id, cashName: 'Castel 65cl', locationId: bar.id,
      lines: [{ productId: p.id!, qty: 2 }],
    });
    const map = await getRecipeMap(db);
    expect(map.get(created.id!)).toEqual([{ productId: p.id, qty: 2 }]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/sale-articles.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/sale-articles.ts
import { eq } from 'drizzle-orm';
import { saleArticles, recipeLines } from '@/db/schema';
import type { AnyDb } from '@/db';

export interface SaleArticleInput {
  id?: number;
  cashName: string;
  locationId: number;
  lines: Array<{ productId: number; qty: number }>;
}

export async function saveSaleArticle(db: AnyDb, input: SaleArticleInput):
  Promise<{ ok: boolean; id?: number; error?: string }> {
  if (!input.cashName.trim()) return { ok: false, error: 'Le nom caisse est obligatoire' };
  if (!input.lines.length) return { ok: false, error: 'La fiche technique doit avoir au moins une ligne' };
  if (input.lines.some((l) => !(l.qty > 0))) {
    return { ok: false, error: 'Toutes les quantités de la fiche doivent être positives' };
  }
  let id = input.id;
  if (id) {
    await db.update(saleArticles)
      .set({ cashName: input.cashName.trim(), locationId: input.locationId })
      .where(eq(saleArticles.id, id));
    await db.delete(recipeLines).where(eq(recipeLines.saleArticleId, id));
  } else {
    const [row] = await db.insert(saleArticles)
      .values({ cashName: input.cashName.trim(), locationId: input.locationId })
      .returning();
    id = row.id;
  }
  await db.insert(recipeLines).values(
    input.lines.map((l) => ({ saleArticleId: id!, productId: l.productId, qty: String(l.qty) })),
  );
  return { ok: true, id };
}

// saleArticleId -> [{productId, qty}] — consommé par le rapprochement (Tâche 20).
export async function getRecipeMap(db: AnyDb): Promise<Map<number, Array<{ productId: number; qty: number }>>> {
  const rows = await db.select().from(recipeLines);
  const map = new Map<number, Array<{ productId: number; qty: number }>>();
  for (const r of rows) {
    const list = map.get(r.saleArticleId) ?? [];
    list.push({ productId: r.productId, qty: Number(r.qty) });
    map.set(r.saleArticleId, list);
  }
  return map;
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/sale-articles.test.ts` → PASS

- [ ] **Step 5: Action + page**

```ts
// src/app/(protected)/admin/articles/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { saveSaleArticle } from '@/lib/sale-articles';

export async function saveSaleArticleAction(_prev: { error?: string }, formData: FormData) {
  await requireRole(['admin']);
  // Lignes de fiche : champs répétés lineProduct[] / lineQty[]
  const productIds = formData.getAll('lineProduct').map(Number);
  const qtys = formData.getAll('lineQty').map(Number);
  const lines = productIds
    .map((productId, i) => ({ productId, qty: qtys[i] }))
    .filter((l) => l.productId && l.qty);
  const res = await saveSaleArticle(db, {
    id: formData.get('id') ? Number(formData.get('id')) : undefined,
    cashName: String(formData.get('cashName') ?? ''),
    locationId: Number(formData.get('locationId')),
    lines,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/articles');
  return {};
}
```

```tsx
// src/app/(protected)/admin/articles/page.tsx
import { db } from '@/db';
import { saleArticles, recipeLines, products, locations } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { ArticleForm } from './article-form';

export const dynamic = 'force-dynamic';

export default async function ArticlesPage() {
  await requireRole(['admin']);
  const arts = await db.select({
    id: saleArticles.id, cashName: saleArticles.cashName, locName: locations.name,
  }).from(saleArticles)
    .innerJoin(locations, eq(saleArticles.locationId, locations.id))
    .orderBy(asc(saleArticles.cashName));
  const lines = await db.select({
    saleArticleId: recipeLines.saleArticleId, qty: recipeLines.qty,
    productName: products.name, baseUnit: products.baseUnit,
  }).from(recipeLines).innerJoin(products, eq(recipeLines.productId, products.id));
  const prods = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const locs = await db.select().from(locations);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Articles de vente & fiches techniques</h1>
      <ArticleForm
        products={prods.map((p) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }))}
        locations={locs.filter((l) => l.type !== 'magasin').map((l) => ({ id: l.id, name: l.name }))}
      />
      <ul className="divide-y bg-white rounded-xl shadow">
        {arts.map((a) => (
          <li key={a.id} className="p-3 text-sm">
            <b>{a.cashName}</b> <span className="text-gray-500">({a.locName})</span>
            <ul className="text-gray-600 pl-4">
              {lines.filter((l) => l.saleArticleId === a.id).map((l, i) => (
                <li key={i}>• {Number(l.qty)} {l.baseUnit} — {l.productName}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/admin/articles/article-form.tsx
'use client';
import { useActionState, useState } from 'react';
import { saveSaleArticleAction } from './actions';

type Prod = { id: number; name: string; baseUnit: string };

export function ArticleForm({ products, locations }: {
  products: Prod[]; locations: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState(saveSaleArticleAction, {});
  const [lineCount, setLineCount] = useState(1);
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <input name="cashName" placeholder="Nom exact dans l'export caisse *"
        className="border rounded p-2 w-full" required />
      <select name="locationId" className="border rounded p-2 w-full" required>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <p className="font-semibold">Fiche technique (consommation par vente) :</p>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <select name="lineProduct" className="border rounded p-2 flex-1">
            <option value="">— produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>
            ))}
          </select>
          <input name="lineQty" type="number" step="0.001" placeholder="Qté"
            className="border rounded p-2 w-24" />
        </div>
      ))}
      <button type="button" onClick={() => setLineCount(lineCount + 1)}
        className="text-indigo-600 text-xs underline">+ Ajouter un ingrédient</button>
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Enregistrer l'article
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — créer « Castel 65cl » (bar, 1 bouteille) et « Poulet DG » (cuisine, 0.4 kg poulet + 0.2 kg plantain).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sale-articles.ts src/app/\(protected\)/admin/articles/ tests/integration/sale-articles.test.ts
git commit -m "feat: articles de vente + fiches techniques (admin)"
```

---

## Phase 2 — Flux quotidiens

### Task 12: Calcul du stock depuis le journal (TDD)

**Files:**
- Create: `src/lib/stock.ts`
- Test: `tests/integration/stock.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/stock.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { getLocationStock } from '@/lib/stock';
import { stockMovements } from '@/db/schema';

describe('getLocationStock', () => {
  it('somme les mouvements par produit pour un emplacement', async () => {
    const db = await createTestDb();
    const { bar, cuisine, barman } = await seedBase(db);
    const castel = await saveProduct(db, {
      name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650, alertThreshold: 10,
    });
    await db.insert(stockMovements).values([
      { productId: castel.id!, locationId: bar.id, type: 'reception', qty: '24', userId: barman.id },
      { productId: castel.id!, locationId: bar.id, type: 'sortie_service', qty: '-10', userId: barman.id },
      // mouvement d'un AUTRE emplacement : ne doit pas compter
      { productId: castel.id!, locationId: cuisine.id, type: 'reception', qty: '5', userId: barman.id },
    ]);
    const stock = await getLocationStock(db, bar.id);
    expect(stock).toEqual([{
      productId: castel.id, name: 'Castel', baseUnit: 'bouteille',
      qty: 14, value: 14 * 650, alertThreshold: 10, belowThreshold: false,
    }]);
  });
  it('signale le passage sous le seuil et les stocks négatifs', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, {
      name: 'Guinness', baseUnit: 'bouteille', purchasePrice: 800, alertThreshold: 10,
    });
    await db.insert(stockMovements).values([
      { productId: p.id!, locationId: bar.id, type: 'reception', qty: '5', userId: barman.id },
      { productId: p.id!, locationId: bar.id, type: 'sortie_service', qty: '-8', userId: barman.id },
    ]);
    const [row] = await getLocationStock(db, bar.id);
    expect(row.qty).toBe(-3);
    expect(row.belowThreshold).toBe(true);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/stock.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/stock.ts
import { eq, sql } from 'drizzle-orm';
import { stockMovements, products } from '@/db/schema';
import { round3 } from './units';
import type { AnyDb } from '@/db';

export interface StockLine {
  productId: number;
  name: string;
  baseUnit: string;
  qty: number;
  value: number; // FCFA
  alertThreshold: number | null;
  belowThreshold: boolean;
}

export async function getLocationStock(db: AnyDb, locationId: number): Promise<StockLine[]> {
  const rows = await db.select({
    productId: products.id,
    name: products.name,
    baseUnit: products.baseUnit,
    purchasePrice: products.purchasePrice,
    alertThreshold: products.alertThreshold,
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(eq(stockMovements.locationId, locationId))
    .groupBy(products.id, products.name, products.baseUnit, products.purchasePrice, products.alertThreshold)
    .orderBy(products.name);

  return rows.map((r: typeof rows[number]) => {
    const qty = round3(Number(r.qty));
    const threshold = r.alertThreshold != null ? Number(r.alertThreshold) : null;
    return {
      productId: r.productId,
      name: r.name,
      baseUnit: r.baseUnit,
      qty,
      value: Math.round(qty * r.purchasePrice),
      alertThreshold: threshold,
      belowThreshold: threshold != null && qty < threshold,
    };
  });
}

// Quantité théorique d'UN produit à un emplacement (utilisé par l'inventaire).
export async function getProductStock(db: AnyDb, locationId: number, productId: number): Promise<number> {
  const [row] = await db.select({
    qty: sql<string>`coalesce(sum(${stockMovements.qty}), 0)`,
  }).from(stockMovements)
    .where(sql`${stockMovements.locationId} = ${locationId} and ${stockMovements.productId} = ${productId}`);
  return round3(Number(row?.qty ?? 0));
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/stock.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stock.ts tests/integration/stock.test.ts
git commit -m "feat: calcul du stock depuis le journal des mouvements"
```

### Task 13: Commandes — création et suivi (barman/cuisinier)

**Files:**
- Create: `src/lib/orders.ts` (création ici ; livraison/réception ajoutées Tâches 14-15)
- Create: `src/app/(protected)/commandes/page.tsx`, `actions.ts`, `order-form.tsx`
- Test: `tests/integration/orders.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/orders.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { createOrder } from '@/lib/orders';
import { orders, orderLines } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('createOrder', () => {
  it('crée une commande en attente avec ses lignes', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: castel.id!, qtyRequested: 36 }],
    });
    expect(res.ok).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.id, res.id!));
    expect(order.status).toBe('en_attente');
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, res.id!));
    expect(Number(lines[0].qtyRequested)).toBe(36);
    expect(lines[0].qtyDelivered).toBeNull();
  });
  it('refuse une commande vide ou avec quantité nulle', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    expect((await createOrder(db, { locationId: bar.id, createdBy: barman.id, lines: [] })).ok).toBe(false);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 0 }],
    })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/orders.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/orders.ts
import { orders, orderLines } from '@/db/schema';
import type { AnyDb } from '@/db';

export async function createOrder(db: AnyDb, input: {
  locationId: number; createdBy: number;
  lines: Array<{ productId: number; qtyRequested: number }>;
}): Promise<{ ok: boolean; id?: number; error?: string }> {
  const lines = input.lines.filter((l) => l.productId);
  if (!lines.length) return { ok: false, error: 'La commande doit contenir au moins un produit' };
  if (lines.some((l) => !(l.qtyRequested > 0))) {
    return { ok: false, error: 'Toutes les quantités doivent être positives' };
  }
  const [order] = await db.insert(orders)
    .values({ locationId: input.locationId, createdBy: input.createdBy })
    .returning();
  await db.insert(orderLines).values(
    lines.map((l) => ({
      orderId: order.id, productId: l.productId, qtyRequested: String(l.qtyRequested),
    })),
  );
  return { ok: true, id: order.id };
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/orders.test.ts` → PASS

- [ ] **Step 5: Action + pages**

```ts
// src/app/(protected)/commandes/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { createOrder } from '@/lib/orders';

export async function createOrderAction(_prev: { error?: string }, formData: FormData) {
  const session = await requireRole(['barman', 'cuisinier']);
  if (!session.locationId) return { error: 'Aucun emplacement associé à votre compte' };
  const productIds = formData.getAll('lineProduct').map(Number);
  const qtys = formData.getAll('lineQty').map(Number);
  const res = await createOrder(db, {
    locationId: session.locationId,
    createdBy: session.userId,
    lines: productIds.map((productId, i) => ({ productId, qtyRequested: qtys[i] }))
      .filter((l) => l.productId && l.qtyRequested),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/commandes');
  return { success: true } as { error?: string; success?: boolean };
}
```

```tsx
// src/app/(protected)/commandes/page.tsx
import { db } from '@/db';
import { orders, orderLines, products } from '@/db/schema';
import { desc, eq, asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { OrderForm } from './order-form';

export const dynamic = 'force-dynamic';
const STATUS_LABEL: Record<string, string> = {
  en_attente: '⏳ En attente', livree: '🚚 Livrée — à réceptionner', receptionnee: '✅ Réceptionnée',
};

export default async function CommandesPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const myOrders = await db.select().from(orders)
    .where(eq(orders.locationId, session.locationId!))
    .orderBy(desc(orders.createdAt)).limit(20);
  const lines = await db.select({
    orderId: orderLines.orderId, qtyRequested: orderLines.qtyRequested,
    qtyDelivered: orderLines.qtyDelivered, name: products.name, baseUnit: products.baseUnit,
  }).from(orderLines).innerJoin(products, eq(orderLines.productId, products.id));
  const prods = await db.select().from(products)
    .where(eq(products.active, true)).orderBy(asc(products.name));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Commandes au magasin</h1>
      <OrderForm products={prods.map((p) => ({
        id: p.id, name: p.name, baseUnit: p.baseUnit,
        packName: p.packName, packSize: p.packSize ? Number(p.packSize) : null,
      }))} />
      <ul className="space-y-2">
        {myOrders.map((o) => (
          <li key={o.id} className="bg-white rounded-xl shadow p-3 text-sm">
            <div className="flex justify-between font-semibold">
              <span>Commande #{o.id}</span><span>{STATUS_LABEL[o.status]}</span>
            </div>
            <ul className="text-gray-600 pl-2">
              {lines.filter((l) => l.orderId === o.id).map((l, i) => (
                <li key={i}>
                  {l.name} : demandé {Number(l.qtyRequested)} {l.baseUnit}
                  {l.qtyDelivered != null && <> — livré {Number(l.qtyDelivered)}</>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/commandes/order-form.tsx
'use client';
import { useActionState, useState } from 'react';
import { createOrderAction } from './actions';

type Prod = { id: number; name: string; baseUnit: string; packName: string | null; packSize: number | null };

export function OrderForm({ products }: { products: Prod[] }) {
  const [state, action, pending] = useActionState(createOrderAction, {});
  const [lineCount, setLineCount] = useState(3);
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <p className="font-semibold">Nouvelle commande (en unités de base) :</p>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <select name="lineProduct" className="border rounded p-2 flex-1">
            <option value="">— produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.baseUnit}{p.packName ? `, ${p.packName}=${p.packSize}` : ''})
              </option>
            ))}
          </select>
          <input name="lineQty" type="number" step="0.001" min="0" placeholder="Qté"
            className="border rounded p-2 w-24" inputMode="decimal" />
        </div>
      ))}
      <button type="button" onClick={() => setLineCount(lineCount + 1)}
        className="text-indigo-600 text-xs underline">+ Ajouter une ligne</button>
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Envoyer la commande
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — connecté en barman, créer une commande → visible « En attente ».

- [ ] **Step 7: Commit**

```bash
git add src/lib/orders.ts src/app/\(protected\)/commandes/ tests/integration/orders.test.ts
git commit -m "feat: création et suivi des commandes (barman/cuisinier)"
```

### Task 14: Livraison (magasinier)

**Files:**
- Modify: `src/lib/orders.ts` (ajouter `deliverOrder`)
- Create: `src/app/(protected)/livraisons/page.tsx`, `actions.ts`, `[id]/page.tsx`, `[id]/delivery-form.tsx`
- Test: `tests/integration/orders.test.ts` (ajouter describe)

- [ ] **Step 1: Test (échoue)** — ajouter à `tests/integration/orders.test.ts` :

```ts
import { deliverOrder } from '@/lib/orders';

describe('deliverOrder', () => {
  it('enregistre les quantités livrées et passe la commande en "livree"', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, {
      name: 'Castel', baseUnit: 'bouteille', packName: 'casier', packSize: 12, purchasePrice: 650,
    });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id,
      lines: [{ productId: castel.id!, qtyRequested: 36 }],
    });
    // Le magasinier livre 2 casiers + 5 bouteilles = 29 (écart vs 36 demandées)
    const res = await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id,
      lines: [{ productId: castel.id!, qtyDelivered: 29 }],
    });
    expect(res.ok).toBe(true);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id!));
    expect(o.status).toBe('livree');
    expect(o.deliveredBy).toBe(magasinier.id);
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id!));
    expect(Number(lines[0].qtyDelivered)).toBe(29);
  });
  it('refuse de livrer une commande déjà livrée', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    const again = await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    expect(again.ok).toBe(false); // protection double soumission
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/orders.test.ts` → FAIL

- [ ] **Step 3: Implémenter** — ajouter à `src/lib/orders.ts` :

```ts
import { eq } from 'drizzle-orm';

export async function deliverOrder(db: AnyDb, input: {
  orderId: number; deliveredBy: number;
  lines: Array<{ productId: number; qtyDelivered: number }>;
}): Promise<{ ok: boolean; error?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) return { ok: false, error: 'Commande introuvable' };
  if (order.status !== 'en_attente') {
    return { ok: false, error: 'Cette commande a déjà été livrée' };
  }
  if (input.lines.some((l) => l.qtyDelivered < 0)) {
    return { ok: false, error: 'Les quantités livrées ne peuvent pas être négatives' };
  }
  for (const line of input.lines) {
    await db.update(orderLines)
      .set({ qtyDelivered: String(line.qtyDelivered) })
      .where(eq(orderLines.orderId, input.orderId))
      // une ligne par produit dans une commande
      .where?.(eq(orderLines.productId, line.productId));
  }
  await db.update(orders)
    .set({ status: 'livree', deliveredBy: input.deliveredBy, deliveredAt: new Date() })
    .where(eq(orders.id, input.orderId));
  return { ok: true };
}
```

**Attention (correction du chaînage ci-dessus)** : Drizzle ne chaîne pas deux `.where()` — utiliser `and()` :

```ts
import { and, eq } from 'drizzle-orm';
// ...dans la boucle :
await db.update(orderLines)
  .set({ qtyDelivered: String(line.qtyDelivered) })
  .where(and(eq(orderLines.orderId, input.orderId), eq(orderLines.productId, line.productId)));
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/orders.test.ts` → PASS

- [ ] **Step 5: Pages magasinier**

```ts
// src/app/(protected)/livraisons/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { deliverOrder } from '@/lib/orders';
import { totalBase } from '@/lib/units';

export async function deliverOrderAction(_prev: { error?: string }, formData: FormData) {
  const session = await requireRole(['magasinier']);
  const orderId = Number(formData.get('orderId'));
  const productIds = formData.getAll('lineProduct').map(Number);
  const packs = formData.getAll('linePacks').map(Number);
  const units = formData.getAll('lineUnits').map(Number);
  const packSizes = formData.getAll('linePackSize').map((v) => (v ? Number(v) : null));
  const lines = productIds.map((productId, i) => ({
    productId,
    qtyDelivered: totalBase({ packs: packs[i] || 0, units: units[i] || 0, packSize: packSizes[i] }),
  }));
  const res = await deliverOrder(db, { orderId, deliveredBy: session.userId, lines });
  if (!res.ok) return { error: res.error };
  revalidatePath('/livraisons');
  redirect('/livraisons');
}
```

```tsx
// src/app/(protected)/livraisons/page.tsx
import Link from 'next/link';
import { db } from '@/db';
import { orders, locations } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LivraisonsPage() {
  await requireRole(['magasinier']);
  const pending = await db.select({
    id: orders.id, createdAt: orders.createdAt, locName: locations.name,
  }).from(orders)
    .innerJoin(locations, eq(orders.locationId, locations.id))
    .where(eq(orders.status, 'en_attente'))
    .orderBy(asc(orders.createdAt));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Commandes en attente de livraison</h1>
      {pending.length === 0 && <p className="text-gray-500">Aucune commande en attente. 👍</p>}
      <ul className="space-y-2">
        {pending.map((o) => (
          <li key={o.id}>
            <Link href={`/livraisons/${o.id}`}
              className="block bg-white rounded-xl shadow p-4 font-semibold">
              Commande #{o.id} — {o.locName}
              <span className="block text-xs text-gray-500 font-normal">
                {new Date(o.createdAt).toLocaleString('fr-FR')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/livraisons/[id]/page.tsx
import { db } from '@/db';
import { orders, orderLines, products, locations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/session';
import { DeliveryForm } from './delivery-form';

export const dynamic = 'force-dynamic';

export default async function LivraisonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['magasinier']);
  const { id } = await params;
  const [order] = await db.select({
    id: orders.id, status: orders.status, locName: locations.name,
  }).from(orders)
    .innerJoin(locations, eq(orders.locationId, locations.id))
    .where(eq(orders.id, Number(id)));
  if (!order || order.status !== 'en_attente') notFound();
  const lines = await db.select({
    productId: orderLines.productId, qtyRequested: orderLines.qtyRequested,
    name: products.name, baseUnit: products.baseUnit,
    packName: products.packName, packSize: products.packSize,
  }).from(orderLines)
    .innerJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, order.id));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Livraison — Commande #{order.id} ({order.locName})</h1>
      <DeliveryForm orderId={order.id} lines={lines.map((l) => ({
        productId: l.productId, name: l.name, baseUnit: l.baseUnit,
        qtyRequested: Number(l.qtyRequested),
        packName: l.packName, packSize: l.packSize ? Number(l.packSize) : null,
      }))} />
    </div>
  );
}
```

```tsx
// src/app/(protected)/livraisons/[id]/delivery-form.tsx
'use client';
import { useActionState } from 'react';
import { deliverOrderAction } from '../actions';

type Line = {
  productId: number; name: string; baseUnit: string; qtyRequested: number;
  packName: string | null; packSize: number | null;
};

export function DeliveryForm({ orderId, lines }: { orderId: number; lines: Line[] }) {
  const [state, action, pending] = useActionState(deliverOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {lines.map((l) => (
        <div key={l.productId} className="bg-white rounded-xl shadow p-3 text-sm space-y-2">
          <p className="font-semibold">{l.name} — demandé : {l.qtyRequested} {l.baseUnit}</p>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <input type="hidden" name="linePackSize" value={l.packSize ?? ''} />
          <div className="flex gap-2 items-center">
            {l.packSize ? (
              <>
                <input name="linePacks" type="number" step="0.5" min="0" defaultValue={0}
                  className="border rounded p-2 w-20" inputMode="decimal" />
                <span>{l.packName}(s) de {l.packSize} +</span>
              </>
            ) : (
              <input type="hidden" name="linePacks" value="0" />
            )}
            <input name="lineUnits" type="number" step="0.001" min="0" defaultValue={0}
              className="border rounded p-2 w-24" inputMode="decimal" />
            <span>{l.baseUnit}(s)</span>
          </div>
        </div>
      ))}
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending}
        className="bg-indigo-600 text-white rounded-lg p-3 w-full font-semibold">
        Enregistrer la livraison
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — en magasinier, ouvrir la commande du barman, livrer « 2 casiers + 5 » → la commande passe « Livrée — à réceptionner » côté barman avec 29 affiché.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orders.ts src/app/\(protected\)/livraisons/ tests/integration/orders.test.ts
git commit -m "feat: saisie de livraison par le magasinier (conversion conditionnements)"
```

### Task 15: Confirmation de réception (mise à jour du stock)

**Files:**
- Modify: `src/lib/orders.ts` (ajouter `receiveOrder` — crée les mouvements)
- Create: `src/app/(protected)/receptions/page.tsx`, `actions.ts`, `[id]/page.tsx`, `[id]/reception-form.tsx`
- Test: `tests/integration/orders.test.ts` (ajouter describe)

- [ ] **Step 1: Test (échoue)** — ajouter :

```ts
import { receiveOrder } from '@/lib/orders';
import { stockMovements } from '@/db/schema';
import { getLocationStock } from '@/lib/stock';

describe('receiveOrder', () => {
  it("crée les mouvements 'reception' et met à jour le stock à la confirmation", async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: castel.id!, qtyRequested: 36 }],
    });
    await deliverOrder(db, {
      orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: castel.id!, qtyDelivered: 29 }],
    });
    // Avant réception : stock inchangé (règle métier n°2 de la spec)
    expect(await getLocationStock(db, bar.id)).toEqual([]);
    // Le barman confirme 28 (1 bouteille cassée : écart livré/reçu)
    const res = await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, lines: [{ productId: castel.id!, qtyReceived: 28 }],
    });
    expect(res.ok).toBe(true);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(28);
    const [mvt] = await db.select().from(stockMovements);
    expect(mvt.type).toBe('reception');
    expect(mvt.refType).toBe('order');
    expect(mvt.refId).toBe(order.id);
    expect(mvt.userId).toBe(barman.id);
  });
  it('refuse une réception sur une commande non livrée ou déjà réceptionnée', async () => {
    const db = await createTestDb();
    const { bar, barman, magasinier } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const order = await createOrder(db, {
      locationId: bar.id, createdBy: barman.id, lines: [{ productId: p.id!, qtyRequested: 5 }],
    });
    expect((await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, lines: [{ productId: p.id!, qtyReceived: 5 }],
    })).ok).toBe(false);
    await deliverOrder(db, { orderId: order.id!, deliveredBy: magasinier.id, lines: [{ productId: p.id!, qtyDelivered: 5 }] });
    await receiveOrder(db, { orderId: order.id!, receivedBy: barman.id, lines: [{ productId: p.id!, qtyReceived: 5 }] });
    expect((await receiveOrder(db, {
      orderId: order.id!, receivedBy: barman.id, lines: [{ productId: p.id!, qtyReceived: 5 }],
    })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/orders.test.ts` → FAIL

- [ ] **Step 3: Implémenter** — ajouter à `src/lib/orders.ts` :

```ts
import { stockMovements } from '@/db/schema';

export async function receiveOrder(db: AnyDb, input: {
  orderId: number; receivedBy: number;
  lines: Array<{ productId: number; qtyReceived: number }>;
}): Promise<{ ok: boolean; error?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) return { ok: false, error: 'Commande introuvable' };
  if (order.status !== 'livree') {
    return { ok: false, error: "Cette commande n'est pas en attente de réception" };
  }
  if (input.lines.some((l) => l.qtyReceived < 0)) {
    return { ok: false, error: 'Les quantités reçues ne peuvent pas être négatives' };
  }
  for (const line of input.lines) {
    await db.update(orderLines)
      .set({ qtyReceived: String(line.qtyReceived) })
      .where(and(eq(orderLines.orderId, input.orderId), eq(orderLines.productId, line.productId)));
  }
  // C'est ICI que le stock bouge (règle métier : à la confirmation, pas à la livraison).
  await db.insert(stockMovements).values(
    input.lines.filter((l) => l.qtyReceived > 0).map((l) => ({
      productId: l.productId, locationId: order.locationId, type: 'reception' as const,
      qty: String(l.qtyReceived), refType: 'order', refId: order.id, userId: input.receivedBy,
    })),
  );
  await db.update(orders)
    .set({ status: 'receptionnee', receivedBy: input.receivedBy, receivedAt: new Date() })
    .where(eq(orders.id, input.orderId));
  return { ok: true };
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test` → PASS (toute la suite)

- [ ] **Step 5: Pages réception**

```ts
// src/app/(protected)/receptions/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { receiveOrder } from '@/lib/orders';

export async function receiveOrderAction(_prev: { error?: string }, formData: FormData) {
  const session = await requireRole(['barman', 'cuisinier']);
  const orderId = Number(formData.get('orderId'));
  const productIds = formData.getAll('lineProduct').map(Number);
  const qtys = formData.getAll('lineQty').map(Number);
  const res = await receiveOrder(db, {
    orderId, receivedBy: session.userId,
    lines: productIds.map((productId, i) => ({ productId, qtyReceived: qtys[i] || 0 })),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/receptions');
  redirect('/stock');
}
```

```tsx
// src/app/(protected)/receptions/page.tsx
import Link from 'next/link';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ReceptionsPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const toReceive = await db.select().from(orders)
    .where(and(eq(orders.status, 'livree'), eq(orders.locationId, session.locationId!)))
    .orderBy(asc(orders.deliveredAt));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Livraisons à confirmer</h1>
      {toReceive.length === 0 && <p className="text-gray-500">Rien à réceptionner.</p>}
      <ul className="space-y-2">
        {toReceive.map((o) => (
          <li key={o.id}>
            <Link href={`/receptions/${o.id}`}
              className="block bg-white rounded-xl shadow p-4 font-semibold">
              Commande #{o.id} — livrée le {o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('fr-FR') : ''}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/receptions/[id]/page.tsx
import { db } from '@/db';
import { orders, orderLines, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/session';
import { ReceptionForm } from './reception-form';

export const dynamic = 'force-dynamic';

export default async function ReceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['barman', 'cuisinier']);
  const { id } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, Number(id)));
  if (!order || order.status !== 'livree' || order.locationId !== session.locationId) notFound();
  const lines = await db.select({
    productId: orderLines.productId, qtyDelivered: orderLines.qtyDelivered,
    name: products.name, baseUnit: products.baseUnit,
  }).from(orderLines)
    .innerJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, order.id));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Confirmer la réception — Commande #{order.id}</h1>
      <p className="text-sm text-gray-600">
        Comptez ce que vous recevez réellement. Un écart avec la quantité livrée sera tracé.
      </p>
      <ReceptionForm orderId={order.id} lines={lines.map((l) => ({
        productId: l.productId, name: l.name, baseUnit: l.baseUnit,
        qtyDelivered: l.qtyDelivered ? Number(l.qtyDelivered) : 0,
      }))} />
    </div>
  );
}
```

```tsx
// src/app/(protected)/receptions/[id]/reception-form.tsx
'use client';
import { useActionState } from 'react';
import { receiveOrderAction } from '../actions';

type Line = { productId: number; name: string; baseUnit: string; qtyDelivered: number };

export function ReceptionForm({ orderId, lines }: { orderId: number; lines: Line[] }) {
  const [state, action, pending] = useActionState(receiveOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {lines.map((l) => (
        <div key={l.productId} className="bg-white rounded-xl shadow p-3 text-sm flex items-center justify-between gap-2">
          <span className="font-semibold">{l.name}<br />
            <span className="font-normal text-gray-500">livré : {l.qtyDelivered} {l.baseUnit}</span>
          </span>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <input name="lineQty" type="number" step="0.001" min="0" defaultValue={l.qtyDelivered}
            className="border rounded p-2 w-24 text-right" inputMode="decimal" />
        </div>
      ))}
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending}
        className="bg-green-600 text-white rounded-lg p-3 w-full font-semibold">
        Confirmer la réception (met à jour mon stock)
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — en barman, confirmer la réception avec un écart → stock visible sur /stock (Tâche 17).

- [ ] **Step 7: Commit**

```bash
git add src/lib/orders.ts src/app/\(protected\)/receptions/ tests/integration/orders.test.ts
git commit -m "feat: confirmation de réception -> mouvements de stock"
```

### Task 16: Sorties de fin de service

**Files:**
- Create: `src/lib/service-exits.ts`
- Create: `src/app/(protected)/sorties/page.tsx`, `actions.ts`, `exit-form.tsx`
- Test: `tests/integration/service-exits.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/service-exits.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { recordServiceExit } from '@/lib/service-exits';
import { getLocationStock } from '@/lib/stock';
import { stockMovements } from '@/db/schema';

describe('recordServiceExit', () => {
  it('crée des mouvements négatifs et signale un stock devenu négatif sans bloquer', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'reception', qty: '10', userId: barman.id,
    });
    // Sortie de 12 alors que le stock est de 10 : accepté, avec avertissement
    const res = await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-10', createdBy: barman.id,
      lines: [{ productId: castel.id!, qty: 12 }],
    });
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual([expect.stringContaining('Castel')]);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(-2);
  });
  it('refuse une saisie vide ou des quantités négatives', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    expect((await recordServiceExit(db, {
      locationId: bar.id, serviceDate: '2026-07-10', createdBy: barman.id, lines: [],
    })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/service-exits.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/service-exits.ts
import { serviceExits, serviceExitLines, stockMovements } from '@/db/schema';
import { getProductStock } from './stock';
import type { AnyDb } from '@/db';

export async function recordServiceExit(db: AnyDb, input: {
  locationId: number; serviceDate: string; createdBy: number;
  lines: Array<{ productId: number; qty: number }>;
}): Promise<{ ok: boolean; warnings?: string[]; error?: string }> {
  const lines = input.lines.filter((l) => l.productId && l.qty);
  if (!lines.length) return { ok: false, error: 'Saisissez au moins un produit sorti' };
  if (lines.some((l) => !(l.qty > 0))) {
    return { ok: false, error: 'Les quantités doivent être positives' };
  }
  // Avertissements stock négatif (règle métier : alerter sans bloquer)
  const warnings: string[] = [];
  for (const l of lines) {
    const current = await getProductStock(db, input.locationId, l.productId);
    if (current - l.qty < 0) {
      const [p] = await db.query.products.findMany
        ? [await db.query.products.findFirst({ where: (t: { id: unknown }, { eq }: { eq: CallableFunction }) => eq(t.id, l.productId) })]
        : [null];
      warnings.push(`${p?.name ?? `Produit #${l.productId}`} : le stock devient négatif (${current} − ${l.qty})`);
    }
  }
  const [exit] = await db.insert(serviceExits).values({
    locationId: input.locationId, serviceDate: input.serviceDate, createdBy: input.createdBy,
  }).returning();
  await db.insert(serviceExitLines).values(
    lines.map((l) => ({ serviceExitId: exit.id, productId: l.productId, qty: String(l.qty) })),
  );
  await db.insert(stockMovements).values(
    lines.map((l) => ({
      productId: l.productId, locationId: input.locationId, type: 'sortie_service' as const,
      qty: String(-l.qty), refType: 'service_exit', refId: exit.id, userId: input.createdBy,
    })),
  );
  return { ok: true, warnings };
}
```

**Simplification à appliquer** : le bloc `db.query.products` ci-dessus est alambiqué — remplacer par une requête directe :

```ts
import { eq } from 'drizzle-orm';
import { products } from '@/db/schema';
// ...dans la boucle :
const [p] = await db.select().from(products).where(eq(products.id, l.productId));
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/service-exits.test.ts` → PASS

- [ ] **Step 5: Action + page**

```ts
// src/app/(protected)/sorties/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { recordServiceExit } from '@/lib/service-exits';

export async function recordExitAction(
  _prev: { error?: string; warnings?: string[]; success?: boolean },
  formData: FormData,
) {
  const session = await requireRole(['barman', 'cuisinier']);
  if (!session.locationId) return { error: 'Aucun emplacement associé' };
  const productIds = formData.getAll('lineProduct').map(Number);
  const qtys = formData.getAll('lineQty').map(Number);
  const res = await recordServiceExit(db, {
    locationId: session.locationId,
    serviceDate: String(formData.get('serviceDate')),
    createdBy: session.userId,
    lines: productIds.map((productId, i) => ({ productId, qty: qtys[i] })),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/sorties');
  return { success: true, warnings: res.warnings };
}
```

```tsx
// src/app/(protected)/sorties/page.tsx
import { db } from '@/db';
import { products, serviceExits } from '@/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { ExitForm } from './exit-form';

export const dynamic = 'force-dynamic';

export default async function SortiesPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const prods = await db.select().from(products)
    .where(eq(products.active, true)).orderBy(asc(products.name));
  const recent = await db.select().from(serviceExits)
    .where(eq(serviceExits.locationId, session.locationId!))
    .orderBy(desc(serviceExits.createdAt)).limit(5);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Sorties de fin de service</h1>
      <ExitForm today={today}
        products={prods.map((p) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }))} />
      <div className="text-sm text-gray-500">
        <p className="font-semibold">Dernières saisies :</p>
        <ul>{recent.map((e) => (
          <li key={e.id}>Service du {e.serviceDate} — saisi le {new Date(e.createdAt).toLocaleString('fr-FR')}</li>
        ))}</ul>
      </div>
    </div>
  );
}
```

```tsx
// src/app/(protected)/sorties/exit-form.tsx
'use client';
import { useActionState, useState } from 'react';
import { recordExitAction } from './actions';

type Prod = { id: number; name: string; baseUnit: string };

export function ExitForm({ products, today }: { products: Prod[]; today: string }) {
  const [state, action, pending] = useActionState(recordExitAction, {});
  const [lineCount, setLineCount] = useState(5);
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="font-semibold">Date de service :</span>
        <input name="serviceDate" type="date" defaultValue={today} className="border rounded p-2" />
      </label>
      <p className="text-xs text-gray-500">
        Service à cheval sur minuit : gardez la date du jour où le service a commencé.
      </p>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <select name="lineProduct" className="border rounded p-2 flex-1">
            <option value="">— produit —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>)}
          </select>
          <input name="lineQty" type="number" step="0.001" min="0" placeholder="Qté"
            className="border rounded p-2 w-24" inputMode="decimal" />
        </div>
      ))}
      <button type="button" onClick={() => setLineCount(lineCount + 2)}
        className="text-indigo-600 text-xs underline">+ Ajouter des lignes</button>
      {state.error && <p className="text-red-600">{state.error}</p>}
      {state.success && <p className="text-green-700 font-semibold">✅ Sorties enregistrées</p>}
      {state.warnings?.map((w: string, i: number) => (
        <p key={i} className="text-amber-700 bg-amber-50 rounded p-2">⚠️ {w}</p>
      ))}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Valider les sorties du service
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — saisir une sortie dépassant le stock → enregistrée + avertissement ⚠️ affiché.

- [ ] **Step 7: Commit**

```bash
git add src/lib/service-exits.ts src/app/\(protected\)/sorties/ tests/integration/service-exits.test.ts
git commit -m "feat: sorties de fin de service (stock négatif alerté, non bloqué)"
```

### Task 17: Écran « Stock de mon emplacement »

**Files:**
- Create: `src/app/(protected)/stock/page.tsx`

- [ ] **Step 1: Page (la logique est déjà testée en Tâche 12)**

```tsx
// src/app/(protected)/stock/page.tsx
import { requireRole } from '@/lib/session';
import { db } from '@/db';
import { getLocationStock } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const stock = await getLocationStock(db, session.locationId!);
  const totalValue = stock.reduce((sum, l) => sum + l.value, 0);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Mon stock</h1>
      <p className="bg-indigo-50 rounded-xl p-3 font-semibold">
        Valeur totale : {totalValue.toLocaleString('fr-FR')} FCFA
      </p>
      <ul className="divide-y bg-white rounded-xl shadow">
        {stock.map((l) => (
          <li key={l.productId} className="p-3 text-sm flex justify-between items-center">
            <span>
              <b>{l.name}</b>
              {l.qty < 0 && <span className="ml-2 text-red-600 font-bold">stock négatif !</span>}
              {l.qty >= 0 && l.belowThreshold && <span className="ml-2 text-amber-600 font-bold">seuil bas</span>}
              <br /><span className="text-gray-500">{l.value.toLocaleString('fr-FR')} FCFA</span>
            </span>
            <span className={`text-lg font-bold ${l.qty < 0 ? 'text-red-600' : l.belowThreshold ? 'text-amber-600' : ''}`}>
              {l.qty} {l.baseUnit}
            </span>
          </li>
        ))}
        {stock.length === 0 && <li className="p-3 text-gray-500">Aucun mouvement de stock pour l'instant.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Vérification manuelle** — le stock reflète réceptions − sorties, alertes visibles.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected\)/stock/
git commit -m "feat: écran stock de mon emplacement (valeur FCFA + alertes)"
```

---

## Phase 3 — Contrôle

### Task 18: Inventaire hebdomadaire

**Files:**
- Create: `src/lib/inventories.ts`
- Create: `src/app/(protected)/inventaire/page.tsx`, `actions.ts`, `inventory-form.tsx`
- Test: `tests/integration/inventories.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/inventories.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { validateInventory } from '@/lib/inventories';
import { getLocationStock } from '@/lib/stock';
import { stockMovements, inventories, inventoryLines } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('validateInventory', () => {
  it("enregistre l'inventaire, calcule les écarts et ajuste le stock", async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await db.insert(stockMovements).values({
      productId: castel.id!, locationId: bar.id, type: 'reception', qty: '24', userId: barman.id,
    });
    // Théorique 24, compté 21 -> écart -3, valorisé -1950 FCFA
    const res = await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: castel.id!, qtyCounted: 21 }],
    });
    expect(res.ok).toBe(true);
    expect(res.gaps).toEqual([{
      productId: castel.id, name: 'Castel', qtyTheoretical: 24, qtyCounted: 21,
      gap: -3, gapValue: -1950,
    }]);
    // Le stock est ajusté au réel
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(21);
    // L'inventaire et ses lignes sont historisés
    const [inv] = await db.select().from(inventories);
    expect(inv.status).toBe('valide');
    const [line] = await db.select().from(inventoryLines).where(eq(inventoryLines.inventoryId, inv.id));
    expect(Number(line.qtyTheoretical)).toBe(24);
    expect(Number(line.qtyCounted)).toBe(21);
  });
  it("un produit non compté n'est pas ajusté ; écart nul ne crée pas de mouvement", async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await db.insert(stockMovements).values({
      productId: p.id!, locationId: bar.id, type: 'reception', qty: '10', userId: barman.id,
    });
    await validateInventory(db, {
      locationId: bar.id, inventoryDate: '2026-07-12', countedBy: barman.id,
      lines: [{ productId: p.id!, qtyCounted: 10 }], // écart nul
    });
    const mvts = await db.select().from(stockMovements)
      .where(eq(stockMovements.type, 'ajustement_inventaire'));
    expect(mvts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/inventories.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/inventories.ts
import { eq } from 'drizzle-orm';
import { inventories, inventoryLines, stockMovements, products } from '@/db/schema';
import { getProductStock } from './stock';
import { round3 } from './units';
import type { AnyDb } from '@/db';

export interface InventoryGap {
  productId: number; name: string;
  qtyTheoretical: number; qtyCounted: number;
  gap: number; gapValue: number; // FCFA (négatif = manquant)
}

export async function validateInventory(db: AnyDb, input: {
  locationId: number; inventoryDate: string; countedBy: number;
  lines: Array<{ productId: number; qtyCounted: number }>;
}): Promise<{ ok: boolean; gaps?: InventoryGap[]; error?: string }> {
  const lines = input.lines.filter((l) => l.productId && l.qtyCounted != null && l.qtyCounted >= 0);
  if (!lines.length) return { ok: false, error: 'Saisissez au moins un comptage' };

  const [inv] = await db.insert(inventories).values({
    locationId: input.locationId, inventoryDate: input.inventoryDate,
    countedBy: input.countedBy, status: 'valide',
  }).returning();

  const gaps: InventoryGap[] = [];
  for (const l of lines) {
    const theoretical = await getProductStock(db, input.locationId, l.productId);
    const [p] = await db.select().from(products).where(eq(products.id, l.productId));
    const gap = round3(l.qtyCounted - theoretical);
    gaps.push({
      productId: l.productId, name: p.name,
      qtyTheoretical: theoretical, qtyCounted: l.qtyCounted,
      gap, gapValue: Math.round(gap * p.purchasePrice),
    });
    await db.insert(inventoryLines).values({
      inventoryId: inv.id, productId: l.productId,
      qtyTheoretical: String(theoretical), qtyCounted: String(l.qtyCounted),
    });
    if (gap !== 0) {
      await db.insert(stockMovements).values({
        productId: l.productId, locationId: input.locationId,
        type: 'ajustement_inventaire', qty: String(gap),
        refType: 'inventory', refId: inv.id, userId: input.countedBy,
      });
    }
  }
  return { ok: true, gaps };
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/inventories.test.ts` → PASS

- [ ] **Step 5: Action + page**

```ts
// src/app/(protected)/inventaire/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { validateInventory, type InventoryGap } from '@/lib/inventories';

export async function validateInventoryAction(
  _prev: { error?: string; gaps?: InventoryGap[] },
  formData: FormData,
) {
  const session = await requireRole(['barman', 'cuisinier']);
  if (!session.locationId) return { error: 'Aucun emplacement associé' };
  const productIds = formData.getAll('lineProduct').map(Number);
  const counted = formData.getAll('lineCounted').map((v) => (v === '' ? null : Number(v)));
  const res = await validateInventory(db, {
    locationId: session.locationId,
    inventoryDate: String(formData.get('inventoryDate')),
    countedBy: session.userId,
    lines: productIds
      .map((productId, i) => ({ productId, qtyCounted: counted[i] as number }))
      .filter((l) => l.qtyCounted != null),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/inventaire');
  revalidatePath('/stock');
  return { gaps: res.gaps };
}
```

```tsx
// src/app/(protected)/inventaire/page.tsx
import { requireRole } from '@/lib/session';
import { db } from '@/db';
import { getLocationStock } from '@/lib/stock';
import { InventoryForm } from './inventory-form';

export const dynamic = 'force-dynamic';

export default async function InventairePage() {
  const session = await requireRole(['barman', 'cuisinier']);
  const stock = await getLocationStock(db, session.locationId!);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Inventaire hebdomadaire</h1>
      <p className="text-sm text-gray-600">
        Comptez physiquement chaque produit. Laissez vide un produit non compté.
        La validation ajuste le stock et historise les écarts.
      </p>
      <InventoryForm today={today} stock={stock.map((l) => ({
        productId: l.productId, name: l.name, baseUnit: l.baseUnit, qtyTheoretical: l.qty,
      }))} />
    </div>
  );
}
```

```tsx
// src/app/(protected)/inventaire/inventory-form.tsx
'use client';
import { useActionState } from 'react';
import { validateInventoryAction } from './actions';

type Line = { productId: number; name: string; baseUnit: string; qtyTheoretical: number };

export function InventoryForm({ stock, today }: { stock: Line[]; today: string }) {
  const [state, action, pending] = useActionState(validateInventoryAction, {});
  if (state.gaps) {
    return (
      <div className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
        <p className="font-bold text-green-700">✅ Inventaire validé — écarts :</p>
        <ul className="divide-y">
          {state.gaps.map((g) => (
            <li key={g.productId} className="py-2 flex justify-between">
              <span>{g.name} : {g.qtyTheoretical} → {g.qtyCounted}</span>
              <span className={g.gap === 0 ? 'text-gray-500' : 'text-red-600 font-semibold'}>
                {g.gap > 0 ? '+' : ''}{g.gap} ({g.gapValue.toLocaleString('fr-FR')} FCFA)
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="font-semibold">Date :</span>
        <input name="inventoryDate" type="date" defaultValue={today} className="border rounded p-2" />
      </label>
      {stock.map((l) => (
        <div key={l.productId} className="flex justify-between items-center gap-2 border-b py-1">
          <span>{l.name} <span className="text-gray-400">(théorique : {l.qtyTheoretical} {l.baseUnit})</span></span>
          <input type="hidden" name="lineProduct" value={l.productId} />
          <input name="lineCounted" type="number" step="0.001" min="0" placeholder="compté"
            className="border rounded p-2 w-24 text-right" inputMode="decimal" />
        </div>
      ))}
      {state.error && <p className="text-red-600">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Valider l'inventaire
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — compter avec un écart → écarts affichés valorisés, stock ajusté sur /stock.

- [ ] **Step 7: Commit**

```bash
git add src/lib/inventories.ts src/app/\(protected\)/inventaire/ tests/integration/inventories.test.ts
git commit -m "feat: inventaire hebdomadaire (écarts valorisés + ajustement)"
```

### Task 19: Parse des fichiers de ventes caisse (lib pure, TDD)

**Files:**
- Create: `src/lib/sales-file.ts`
- Test: `tests/unit/sales-file.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/unit/sales-file.test.ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSalesFile } from '@/lib/sales-file';

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

describe('parseSalesFile', () => {
  it('parse un CSV séparé par point-virgule avec en-têtes', () => {
    const buf = csvBuffer('Article;Quantité\nCastel 65cl;24\nPoulet DG;7\n');
    const res = parseSalesFile(buf, 'ventes.csv');
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { articleName: 'Castel 65cl', qty: 24 },
      { articleName: 'Poulet DG', qty: 7 },
    ]);
  });
  it('parse un fichier Excel (2 colonnes : article, quantité)', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Article', 'Qté'], ['Guinness', 12], ['Whisky (verre)', 30]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventes');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = parseSalesFile(buf, 'ventes.xlsx');
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { articleName: 'Guinness', qty: 12 },
      { articleName: 'Whisky (verre)', qty: 30 },
    ]);
  });
  it('cumule les doublons et ignore les lignes sans quantité numérique', () => {
    const buf = csvBuffer('Article;Qte\nCastel;10\nCastel;5\nLigne vide;\n');
    const res = parseSalesFile(buf, 'ventes.csv');
    expect(res.rows).toEqual([{ articleName: 'Castel', qty: 15 }]);
    expect(res.skipped).toBe(1);
  });
  it('signale un fichier illisible', () => {
    const res = parseSalesFile(Buffer.from([0x00, 0x01]), 'fichier.bin');
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/unit/sales-file.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/sales-file.ts
import * as XLSX from 'xlsx';
import { round3 } from './units';

export interface ParsedSales {
  ok: boolean;
  rows: Array<{ articleName: string; qty: number }>;
  skipped: number; // lignes ignorées (sans nom ou sans quantité numérique)
  error?: string;
}

// Lit la 1re feuille ; attend 2 colonnes : nom d'article, quantité.
// La 1re ligne est traitée comme en-tête si sa 2e colonne n'est pas numérique.
export function parseSalesFile(buffer: Buffer, filename: string): ParsedSales {
  let rows: Array<Array<string | number>>;
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', ...(filename.endsWith('.csv') ? { FS: ';' } : {}) });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('feuille vide');
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  } catch {
    return { ok: false, rows: [], skipped: 0, error: 'Fichier illisible : format attendu CSV ou Excel' };
  }
  if (!rows.length) return { ok: false, rows: [], skipped: 0, error: 'Fichier vide' };

  const start = isNaN(Number(rows[0]?.[1])) || String(rows[0]?.[1]).trim() === '' ? 1 : 0;
  const acc = new Map<string, number>();
  let skipped = 0;
  for (const row of rows.slice(start)) {
    const name = String(row[0] ?? '').trim();
    const qty = Number(String(row[1] ?? '').replace(',', '.'));
    if (!name && !row[1]) continue; // ligne totalement vide : ignorée silencieusement
    if (!name || isNaN(qty) || qty <= 0) { skipped++; continue; }
    acc.set(name, round3((acc.get(name) ?? 0) + qty));
  }
  if (!acc.size) return { ok: false, rows: [], skipped, error: 'Aucune ligne de vente exploitable' };
  return {
    ok: true,
    rows: Array.from(acc, ([articleName, qty]) => ({ articleName, qty })),
    skipped,
  };
}
```

Note : le vrai export de la caisse peut avoir d'autres colonnes — au premier essai avec un fichier réel, ajuster ce parseur (et ses tests) pour cibler les bonnes colonnes. Le contrat de sortie `{articleName, qty}[]` ne change pas.

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/unit/sales-file.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales-file.ts tests/unit/sales-file.test.ts
git commit -m "feat: parse CSV/Excel des ventes caisse"
```

### Task 20: Rapprochement (lib pure, TDD)

**Files:**
- Create: `src/lib/reconciliation.ts`
- Test: `tests/unit/reconciliation.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/unit/reconciliation.test.ts
import { describe, it, expect } from 'vitest';
import { computeTheoretical, reconcile } from '@/lib/reconciliation';

describe('computeTheoretical', () => {
  it('multiplie les ventes par les fiches techniques et cumule par produit', () => {
    const recipes = new Map([
      [1, [{ productId: 10, qty: 1 }]],                                   // Castel = 1 bouteille (p10)
      [2, [{ productId: 20, qty: 0.4 }, { productId: 30, qty: 0.2 }]],    // Poulet DG
      [3, [{ productId: 20, qty: 0.3 }]],                                 // Poulet rôti (même poulet p20)
    ]);
    const sales = [
      { saleArticleId: 1, qty: 24 },
      { saleArticleId: 2, qty: 5 },
      { saleArticleId: 3, qty: 4 },
    ];
    const theo = computeTheoretical(sales, recipes);
    expect(theo.get(10)).toBe(24);
    expect(theo.get(20)).toBeCloseTo(3.2); // 5×0.4 + 4×0.3
    expect(theo.get(30)).toBeCloseTo(1.0);
  });
});

describe('reconcile', () => {
  it('compare théorique et déclaré, valorise les écarts en FCFA', () => {
    const theoretical = new Map([[10, 24], [20, 3.2]]);
    const declared = new Map([[10, 24], [20, 2.8]]);
    const products = new Map([
      [10, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 }],
      [20, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 }],
    ]);
    const lines = reconcile(theoretical, declared, products);
    expect(lines).toEqual([
      { productId: 10, name: 'Castel', baseUnit: 'bouteille',
        theoretical: 24, declared: 24, gap: 0, gapValue: 0 },
      { productId: 20, name: 'Poulet', baseUnit: 'kg',
        theoretical: 3.2, declared: 2.8, gap: -0.4, gapValue: -1400 },
    ]);
  });
  it('inclut les produits déclarés mais non vendus, et inversement', () => {
    const theoretical = new Map([[10, 5]]);   // vendu mais aucune sortie déclarée
    const declared = new Map([[20, 2]]);       // sorti mais aucune vente
    const products = new Map([
      [10, { name: 'A', baseUnit: 'u', purchasePrice: 100 }],
      [20, { name: 'B', baseUnit: 'u', purchasePrice: 200 }],
    ]);
    const lines = reconcile(theoretical, declared, products);
    expect(lines.find((l) => l.productId === 10)).toMatchObject({ theoretical: 5, declared: 0, gap: -5 });
    expect(lines.find((l) => l.productId === 20)).toMatchObject({ theoretical: 0, declared: 2, gap: 2 });
  });
});
```

Convention de signe : `gap = declared − theoretical`. **Négatif = sorties déclarées inférieures aux ventes** (produits vendus dont la sortie n'a pas été déclarée — le cas à surveiller). Positif = plus de sorties que de ventes (sur-consommation, casse ou offert non vendu).

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/unit/reconciliation.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/reconciliation.ts
import { round3 } from './units';

export type RecipeMap = Map<number, Array<{ productId: number; qty: number }>>;

export function computeTheoretical(
  sales: Array<{ saleArticleId: number; qty: number }>,
  recipes: RecipeMap,
): Map<number, number> {
  const theo = new Map<number, number>();
  for (const sale of sales) {
    for (const line of recipes.get(sale.saleArticleId) ?? []) {
      theo.set(line.productId, round3((theo.get(line.productId) ?? 0) + sale.qty * line.qty));
    }
  }
  return theo;
}

export interface ReconciliationLine {
  productId: number; name: string; baseUnit: string;
  theoretical: number; declared: number;
  gap: number;       // declared - theoretical ; négatif = sorties manquantes
  gapValue: number;  // FCFA
}

export function reconcile(
  theoretical: Map<number, number>,
  declared: Map<number, number>,
  products: Map<number, { name: string; baseUnit: string; purchasePrice: number }>,
): ReconciliationLine[] {
  const productIds = new Set([...theoretical.keys(), ...declared.keys()]);
  const lines: ReconciliationLine[] = [];
  for (const productId of productIds) {
    const p = products.get(productId);
    if (!p) continue;
    const theo = theoretical.get(productId) ?? 0;
    const decl = declared.get(productId) ?? 0;
    const gap = round3(decl - theo);
    lines.push({
      productId, name: p.name, baseUnit: p.baseUnit,
      theoretical: theo, declared: decl,
      gap, gapValue: Math.round(gap * p.purchasePrice),
    });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/unit/reconciliation.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/reconciliation.ts tests/unit/reconciliation.test.ts
git commit -m "feat: calcul consommation théorique + rapprochement valorisé"
```

### Task 21: Import des ventes + correspondances + rapport (comptable)

**Files:**
- Create: `src/lib/sales-imports.ts`
- Create: `src/app/(protected)/compta/imports/page.tsx`, `actions.ts`
- Create: `src/app/(protected)/compta/rapprochements/page.tsx`
- Test: `tests/integration/sales-imports.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/sales-imports.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { saveSaleArticle } from '@/lib/sale-articles';
import { recordServiceExit } from '@/lib/service-exits';
import { storeSalesImport, matchImportLine, getReconciliationReport } from '@/lib/sales-imports';
import { stockMovements } from '@/db/schema';

async function setup(db: Awaited<ReturnType<typeof createTestDb>>) {
  const base = await seedBase(db);
  const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
  const article = await saveSaleArticle(db, {
    cashName: 'Castel 65cl', locationId: base.bar.id,
    lines: [{ productId: castel.id!, qty: 1 }],
  });
  // Stock initial + sorties déclarées : 20 castel sorties le 2026-07-10
  await db.insert(stockMovements).values({
    productId: castel.id!, locationId: base.bar.id, type: 'reception', qty: '48', userId: base.barman.id,
  });
  await recordServiceExit(db, {
    locationId: base.bar.id, serviceDate: '2026-07-10', createdBy: base.barman.id,
    lines: [{ productId: castel.id!, qty: 20 }],
  });
  return { ...base, castel, article };
}

describe('storeSalesImport', () => {
  it('associe automatiquement les articles connus et met en attente les inconnus', async () => {
    const db = await createTestDb();
    const { comptable } = await setup(db);
    const res = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [
        { articleName: 'Castel 65cl', qty: 24 },   // connu
        { articleName: 'Mojito spécial', qty: 3 }, // inconnu
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.matched).toBe(1);
    expect(res.unmatched).toBe(1);
  });
});

describe('matchImportLine + rapport', () => {
  it('la correspondance manuelle est mémorisée et le rapport compare théorique vs déclaré', async () => {
    const db = await createTestDb();
    const { comptable, bar, castel } = await setup(db);
    const imp = await storeSalesImport(db, {
      filename: 'ventes.csv', serviceDate: '2026-07-10', uploadedBy: comptable.id,
      rows: [{ articleName: 'CASTEL GRANDE', qty: 24 }], // orthographe caisse inconnue
    });
    // Le comptable associe la ligne inconnue à l'article existant -> mémorisé comme alias
    const pending = await import('@/db/schema').then((s) =>
      db.select().from(s.salesImportLines));
    await matchImportLine(db, { lineId: pending[0].id, saleArticleCashName: 'Castel 65cl' });

    const report = await getReconciliationReport(db, { importId: imp.id!, locationId: bar.id });
    // Théorique 24 (ventes) vs déclaré 20 (sorties) -> gap -4, -2600 FCFA
    const line = report.lines.find((l) => l.productId === castel.id)!;
    expect(line).toMatchObject({ theoretical: 24, declared: 20, gap: -4, gapValue: -2600 });
    expect(report.totalGapValue).toBe(-2600);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/sales-imports.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/sales-imports.ts
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import {
  salesImports, salesImportLines, saleArticles, products,
  serviceExits, serviceExitLines,
} from '@/db/schema';
import { getRecipeMap } from './sale-articles';
import { computeTheoretical, reconcile, type ReconciliationLine } from './reconciliation';
import type { AnyDb } from '@/db';

export async function storeSalesImport(db: AnyDb, input: {
  filename: string; serviceDate: string; uploadedBy: number;
  rows: Array<{ articleName: string; qty: number }>;
}): Promise<{ ok: boolean; id?: number; matched?: number; unmatched?: number; error?: string }> {
  if (!input.rows.length) return { ok: false, error: 'Aucune ligne à importer' };
  const articles = await db.select().from(saleArticles);
  const byName = new Map(articles.map((a: { cashName: string; id: number }) =>
    [a.cashName.toLowerCase(), a.id]));
  const [imp] = await db.insert(salesImports).values({
    filename: input.filename, serviceDate: input.serviceDate, uploadedBy: input.uploadedBy,
  }).returning();
  let matched = 0, unmatched = 0;
  for (const row of input.rows) {
    const saleArticleId = byName.get(row.articleName.trim().toLowerCase()) ?? null;
    saleArticleId ? matched++ : unmatched++;
    await db.insert(salesImportLines).values({
      importId: imp.id, articleNameRaw: row.articleName.trim(),
      qty: String(row.qty), saleArticleId,
    });
  }
  return { ok: true, id: imp.id, matched, unmatched };
}

// Associe une ligne en attente à un article existant (par nom caisse) et
// mémorise l'alias : le nom brut devient un article pointant la même fiche… 
// Choix v1 simple : on met à jour la ligne ET on enregistre l'orthographe brute
// comme nouvel article partageant la même fiche technique n'est PAS dupliqué ;
// on ajoute plutôt l'alias en tant que cash_name alternatif via une ligne saleArticles
// UNIQUEMENT si l'utilisateur le demande. V1 : la correspondance vaut pour cet import,
// et on crée l'alias automatiquement pour les prochains imports.
export async function matchImportLine(db: AnyDb, input: {
  lineId: number; saleArticleCashName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const [target] = await db.select().from(saleArticles)
    .where(eq(saleArticles.cashName, input.saleArticleCashName));
  if (!target) return { ok: false, error: 'Article de vente introuvable' };
  const [line] = await db.select().from(salesImportLines)
    .where(eq(salesImportLines.id, input.lineId));
  if (!line) return { ok: false, error: 'Ligne d’import introuvable' };
  await db.update(salesImportLines)
    .set({ saleArticleId: target.id })
    .where(eq(salesImportLines.id, input.lineId));
  // Alias mémorisé : futur import avec ce nom brut matchera directement.
  // Implémentation : réutiliser saveSaleArticle est impossible (fiche dupliquée) ;
  // on insère une ligne d'alias LÉGÈRE -> même fiche, en copiant les recipe_lines.
  const { recipeLines } = await import('@/db/schema');
  const existingAlias = await db.select().from(saleArticles)
    .where(eq(saleArticles.cashName, line.articleNameRaw));
  if (!existingAlias.length && line.articleNameRaw.toLowerCase() !== target.cashName.toLowerCase()) {
    const [alias] = await db.insert(saleArticles).values({
      cashName: line.articleNameRaw, locationId: target.locationId,
    }).returning();
    const lines = await db.select().from(recipeLines)
      .where(eq(recipeLines.saleArticleId, target.id));
    if (lines.length) {
      await db.insert(recipeLines).values(lines.map((l: { productId: number; qty: string }) => ({
        saleArticleId: alias.id, productId: l.productId, qty: l.qty,
      })));
    }
  }
  return { ok: true };
}

export interface ReconciliationReport {
  lines: ReconciliationLine[];
  totalGapValue: number;
  unmatchedCount: number;
}

// Compare : ventes de l'import (converties via fiches) vs sorties déclarées
// du même emplacement à la même date de service.
export async function getReconciliationReport(db: AnyDb, input: {
  importId: number; locationId: number;
}): Promise<ReconciliationReport> {
  const [imp] = await db.select().from(salesImports).where(eq(salesImports.id, input.importId));
  const importLines = await db.select().from(salesImportLines)
    .where(eq(salesImportLines.importId, input.importId));
  const unmatchedCount = importLines.filter((l: { saleArticleId: number | null }) => !l.saleArticleId).length;

  // Ventes matchées, restreintes aux articles de CET emplacement
  const articles = await db.select().from(saleArticles)
    .where(eq(saleArticles.locationId, input.locationId));
  const articleIds = new Set(articles.map((a: { id: number }) => a.id));
  const sales = importLines
    .filter((l: { saleArticleId: number | null }) => l.saleArticleId && articleIds.has(l.saleArticleId))
    .map((l: { saleArticleId: number; qty: string }) => ({
      saleArticleId: l.saleArticleId, qty: Number(l.qty),
    }));
  const theoretical = computeTheoretical(sales, await getRecipeMap(db));

  // Sorties déclarées du même jour de service
  const exits = await db.select({
    productId: serviceExitLines.productId,
    qty: sql<string>`sum(${serviceExitLines.qty})`,
  }).from(serviceExitLines)
    .innerJoin(serviceExits, eq(serviceExitLines.serviceExitId, serviceExits.id))
    .where(and(
      eq(serviceExits.locationId, input.locationId),
      eq(serviceExits.serviceDate, imp.serviceDate),
    ))
    .groupBy(serviceExitLines.productId);
  const declared = new Map<number, number>(
    exits.map((e: { productId: number; qty: string }) => [e.productId, Number(e.qty)]));

  const prods = await db.select().from(products);
  const productMap = new Map(prods.map((p: { id: number; name: string; baseUnit: string; purchasePrice: number }) =>
    [p.id, { name: p.name, baseUnit: p.baseUnit, purchasePrice: p.purchasePrice }]));

  const lines = reconcile(theoretical, declared, productMap);
  return {
    lines,
    totalGapValue: lines.reduce((sum, l) => sum + l.gapValue, 0),
    unmatchedCount,
  };
}
```

**Nettoyage requis avant commit** : le commentaire de `matchImportLine` ci-dessus contient des hésitations de rédaction — le réduire à :
```ts
// Associe une ligne en attente à un article existant, puis mémorise
// l'orthographe brute comme alias (article + copie de fiche) pour
// que les prochains imports matchent automatiquement.
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/sales-imports.test.ts` → PASS

- [ ] **Step 5: Pages comptable (upload + rapport)**

```ts
// src/app/(protected)/compta/imports/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { parseSalesFile } from '@/lib/sales-file';
import { storeSalesImport, matchImportLine } from '@/lib/sales-imports';

export async function uploadSalesAction(
  _prev: { error?: string; summary?: string },
  formData: FormData,
) {
  const session = await requireRole(['comptable']);
  const file = formData.get('file') as File | null;
  const serviceDate = String(formData.get('serviceDate'));
  if (!file || !file.size) return { error: 'Choisissez un fichier CSV ou Excel' };
  const parsed = parseSalesFile(Buffer.from(await file.arrayBuffer()), file.name);
  if (!parsed.ok) return { error: parsed.error };
  const res = await storeSalesImport(db, {
    filename: file.name, serviceDate, uploadedBy: session.userId, rows: parsed.rows,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/compta/imports');
  return {
    summary: `Import réussi : ${res.matched} article(s) reconnus, ${res.unmatched} à faire correspondre, ${parsed.skipped} ligne(s) ignorée(s).`,
  };
}

export async function matchLineAction(formData: FormData) {
  await requireRole(['comptable']);
  await matchImportLine(db, {
    lineId: Number(formData.get('lineId')),
    saleArticleCashName: String(formData.get('cashName')),
  });
  revalidatePath('/compta/imports');
}
```

```tsx
// src/app/(protected)/compta/imports/page.tsx
import { db } from '@/db';
import { salesImports, salesImportLines, saleArticles } from '@/db/schema';
import { desc, eq, isNull } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { UploadForm } from './upload-form';
import { matchLineAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  await requireRole(['comptable']);
  const imports = await db.select().from(salesImports)
    .orderBy(desc(salesImports.createdAt)).limit(10);
  const pending = await db.select().from(salesImportLines)
    .where(isNull(salesImportLines.saleArticleId));
  const articles = await db.select().from(saleArticles).orderBy(saleArticles.cashName);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Import des ventes caisse</h1>
      <UploadForm />
      {pending.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-3 space-y-2 text-sm">
          <p className="font-semibold">⚠️ Articles à faire correspondre :</p>
          {pending.map((l) => (
            <form key={l.id} action={matchLineAction} className="flex gap-2 items-center">
              <input type="hidden" name="lineId" value={l.id} />
              <span className="flex-1">« {l.articleNameRaw} » (qté {Number(l.qty)})</span>
              <select name="cashName" className="border rounded p-1">
                {articles.map((a) => <option key={a.id} value={a.cashName}>{a.cashName}</option>)}
              </select>
              <button className="bg-indigo-600 text-white rounded px-2 py-1 text-xs">Associer</button>
            </form>
          ))}
        </div>
      )}
      <ul className="divide-y bg-white rounded-xl shadow text-sm">
        {imports.map((i) => (
          <li key={i.id} className="p-3">
            <a href={`/compta/rapprochements?importId=${i.id}`} className="text-indigo-700 underline">
              {i.filename}</a> — service du {i.serviceDate}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/compta/imports/upload-form.tsx
'use client';
import { useActionState } from 'react';
import { uploadSalesAction } from './actions';

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadSalesAction, {});
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
      <label className="block">
        <span className="font-semibold">Journée de service :</span>
        <input name="serviceDate" type="date" defaultValue={today} className="border rounded p-2 ml-2" required />
      </label>
      <input name="file" type="file" accept=".csv,.xlsx,.xls" className="block w-full" required />
      {state.error && <p className="text-red-600">{state.error}</p>}
      {state.summary && <p className="text-green-700">{state.summary}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 w-full font-semibold">
        Importer les ventes
      </button>
    </form>
  );
}
```

```tsx
// src/app/(protected)/compta/rapprochements/page.tsx
import { db } from '@/db';
import { locations, salesImports } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getReconciliationReport } from '@/lib/sales-imports';

export const dynamic = 'force-dynamic';

export default async function RapprochementsPage({ searchParams }: {
  searchParams: Promise<{ importId?: string }>;
}) {
  await requireRole(['comptable']);
  const { importId } = await searchParams;
  const imports = await db.select().from(salesImports).orderBy(desc(salesImports.createdAt)).limit(10);
  const selected = importId ? Number(importId) : imports[0]?.id;
  if (!selected) return <p className="text-gray-500">Importez d'abord un fichier de ventes.</p>;
  const locs = await db.select().from(locations).where(eq(locations.type, 'bar'))
    .union(db.select().from(locations).where(eq(locations.type, 'cuisine')));
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold">Rapprochement ventes ↔ sorties</h1>
      {await Promise.all(locs.map(async (loc) => {
        const report = await getReconciliationReport(db, { importId: selected, locationId: loc.id });
        return (
          <section key={loc.id} className="space-y-2">
            <h2 className="font-semibold">{loc.name}
              {report.unmatchedCount > 0 &&
                <span className="text-amber-600 text-sm"> — {report.unmatchedCount} article(s) non reconnu(s) exclus</span>}
            </h2>
            <table className="w-full bg-white rounded-xl shadow text-sm">
              <thead><tr className="text-left text-gray-500">
                <th className="p-2">Produit</th><th>Théorique</th><th>Déclaré</th><th>Écart</th><th className="text-right p-2">FCFA</th>
              </tr></thead>
              <tbody>
                {report.lines.map((l) => (
                  <tr key={l.productId} className={l.gap !== 0 ? 'bg-red-50' : ''}>
                    <td className="p-2">{l.name}</td>
                    <td>{l.theoretical} {l.baseUnit}</td>
                    <td>{l.declared}</td>
                    <td className={l.gap !== 0 ? 'text-red-600 font-semibold' : ''}>
                      {l.gap > 0 ? '+' : ''}{l.gap}</td>
                    <td className="text-right p-2">{l.gapValue.toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t">
                <td className="p-2" colSpan={4}>Écart total valorisé</td>
                <td className="text-right p-2">{report.totalGapValue.toLocaleString('fr-FR')} FCFA</td>
              </tr></tfoot>
            </table>
          </section>
        );
      }))}
    </div>
  );
}
```

**Simplification autorisée** : si `union` pose problème avec Drizzle/PGlite, remplacer par `db.select().from(locations)` puis `.filter((l) => l.type !== 'magasin')` en JS — 3 lignes, aucune performance en jeu.

- [ ] **Step 6: Vérification manuelle** — uploader un CSV test (`Article;Quantité` + « Castel 65cl;24 ») → résumé d'import, rapport avec écarts en rouge, total FCFA.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sales-imports.ts src/app/\(protected\)/compta/ tests/integration/sales-imports.test.ts
git commit -m "feat: import ventes caisse + correspondances + rapport de rapprochement"
```

### Task 22: Tableau de bord comptable

**Files:**
- Create: `src/app/(protected)/compta/page.tsx`

- [ ] **Step 1: Page (réutilise `getLocationStock`, déjà testé)**

```tsx
// src/app/(protected)/compta/page.tsx
import { db } from '@/db';
import { locations, inventories, inventoryLines, products } from '@/db/schema';
import { desc, eq, ne } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { getLocationStock } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export default async function ComptaDashboard() {
  await requireRole(['comptable']);
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin'));
  const stocks = await Promise.all(locs.map(async (loc) => ({
    loc, lines: await getLocationStock(db, loc.id),
  })));
  const lastInventories = await db.select({
    id: inventories.id, date: inventories.inventoryDate, locName: locations.name,
  }).from(inventories)
    .innerJoin(locations, eq(inventories.locationId, locations.id))
    .orderBy(desc(inventories.createdAt)).limit(5);
  const lastInvGaps = lastInventories.length
    ? await db.select({
        inventoryId: inventoryLines.inventoryId,
        qtyTheoretical: inventoryLines.qtyTheoretical,
        qtyCounted: inventoryLines.qtyCounted,
        price: products.purchasePrice,
      }).from(inventoryLines)
        .innerJoin(products, eq(inventoryLines.productId, products.id))
    : [];
  const gapValueByInventory = new Map<number, number>();
  for (const l of lastInvGaps) {
    const gap = (Number(l.qtyCounted) - Number(l.qtyTheoretical)) * l.price;
    gapValueByInventory.set(l.inventoryId, Math.round((gapValueByInventory.get(l.inventoryId) ?? 0) + gap));
  }
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold">Tableau de bord</h1>
      {stocks.map(({ loc, lines }) => {
        const total = lines.reduce((s, l) => s + l.value, 0);
        const alerts = lines.filter((l) => l.belowThreshold || l.qty < 0);
        return (
          <section key={loc.id} className="bg-white rounded-xl shadow p-4 space-y-1">
            <div className="flex justify-between font-semibold">
              <span>{loc.name}</span>
              <span>{total.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <p className="text-sm text-gray-500">{lines.length} produit(s) en stock</p>
            {alerts.map((l) => (
              <p key={l.productId} className="text-sm text-amber-700">
                ⚠️ {l.name} : {l.qty} {l.baseUnit}{l.qty < 0 ? ' (négatif !)' : ' (sous le seuil)'}
              </p>
            ))}
          </section>
        );
      })}
      <section className="space-y-1">
        <h2 className="font-semibold">Derniers inventaires</h2>
        <ul className="divide-y bg-white rounded-xl shadow text-sm">
          {lastInventories.map((inv) => (
            <li key={inv.id} className="p-3 flex justify-between">
              <span>{inv.locName} — {inv.date}</span>
              <span className={(gapValueByInventory.get(inv.id) ?? 0) < 0 ? 'text-red-600 font-semibold' : ''}>
                écart : {(gapValueByInventory.get(inv.id) ?? 0).toLocaleString('fr-FR')} FCFA
              </span>
            </li>
          ))}
          {lastInventories.length === 0 && <li className="p-3 text-gray-500">Aucun inventaire pour l'instant.</li>}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Vérification manuelle** — valeurs par emplacement, alertes et derniers inventaires visibles.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected\)/compta/page.tsx
git commit -m "feat: tableau de bord comptable (stock valorisé + alertes + inventaires)"
```

### Task 23: Ajustements admin (correction d'erreurs, motif obligatoire)

**Files:**
- Create: `src/lib/adjustments.ts`
- Create: `src/app/(protected)/admin/ajustements/page.tsx`, `actions.ts`, `adjustment-form.tsx`
- Test: `tests/integration/adjustments.test.ts`

- [ ] **Step 1: Test (échoue)**

```ts
// tests/integration/adjustments.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { recordAdjustment } from '@/lib/adjustments';
import { getLocationStock } from '@/lib/stock';

describe('recordAdjustment', () => {
  it('crée un mouvement signé avec motif', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const res = await recordAdjustment(db, {
      productId: p.id!, locationId: bar.id, qty: -2,
      reason: 'Correction erreur de saisie du 09/07', userId: admin.id,
    });
    expect(res.ok).toBe(true);
    const stock = await getLocationStock(db, bar.id);
    expect(stock[0].qty).toBe(-2);
  });
  it('refuse un ajustement sans motif ou de quantité nulle', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const p = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await recordAdjustment(db, {
      productId: p.id!, locationId: bar.id, qty: 1, reason: '  ', userId: admin.id,
    })).ok).toBe(false);
    expect((await recordAdjustment(db, {
      productId: p.id!, locationId: bar.id, qty: 0, reason: 'motif', userId: admin.id,
    })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test -- tests/integration/adjustments.test.ts` → FAIL

- [ ] **Step 3: Implémenter**

```ts
// src/lib/adjustments.ts
import { stockMovements } from '@/db/schema';
import type { AnyDb } from '@/db';

export async function recordAdjustment(db: AnyDb, input: {
  productId: number; locationId: number; qty: number; reason: string; userId: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.reason.trim()) return { ok: false, error: 'Le motif est obligatoire' };
  if (!input.qty) return { ok: false, error: 'La quantité ne peut pas être nulle' };
  await db.insert(stockMovements).values({
    productId: input.productId, locationId: input.locationId,
    type: 'ajustement_admin', qty: String(input.qty),
    reason: input.reason.trim(), userId: input.userId,
  });
  return { ok: true };
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npm test -- tests/integration/adjustments.test.ts` → PASS

- [ ] **Step 5: Action + page (avec journal récent)**

```ts
// src/app/(protected)/admin/ajustements/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { recordAdjustment } from '@/lib/adjustments';

export async function recordAdjustmentAction(_prev: { error?: string }, formData: FormData) {
  const session = await requireRole(['admin']);
  const res = await recordAdjustment(db, {
    productId: Number(formData.get('productId')),
    locationId: Number(formData.get('locationId')),
    qty: Number(formData.get('qty')),
    reason: String(formData.get('reason') ?? ''),
    userId: session.userId,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/ajustements');
  return {};
}
```

```tsx
// src/app/(protected)/admin/ajustements/page.tsx
import { db } from '@/db';
import { stockMovements, products, locations, users } from '@/db/schema';
import { desc, eq, ne, asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { AdjustmentForm } from './adjustment-form';

export const dynamic = 'force-dynamic';

export default async function AjustementsPage() {
  await requireRole(['admin']);
  const prods = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin'));
  const journal = await db.select({
    id: stockMovements.id, type: stockMovements.type, qty: stockMovements.qty,
    reason: stockMovements.reason, createdAt: stockMovements.createdAt,
    productName: products.name, locName: locations.name, userName: users.name,
  }).from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .innerJoin(locations, eq(stockMovements.locationId, locations.id))
    .innerJoin(users, eq(stockMovements.userId, users.id))
    .orderBy(desc(stockMovements.createdAt)).limit(30);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Ajustements & journal des mouvements</h1>
      <AdjustmentForm
        products={prods.map((p) => ({ id: p.id, name: p.name, baseUnit: p.baseUnit }))}
        locations={locs.map((l) => ({ id: l.id, name: l.name }))} />
      <ul className="divide-y bg-white rounded-xl shadow text-xs">
        {journal.map((m) => (
          <li key={m.id} className="p-2">
            <b>{m.productName}</b> — {m.locName} — {Number(m.qty) > 0 ? '+' : ''}{Number(m.qty)}
            — {m.type} — {m.userName} — {new Date(m.createdAt).toLocaleString('fr-FR')}
            {m.reason && <em className="block text-gray-500">Motif : {m.reason}</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/(protected)/admin/ajustements/adjustment-form.tsx
'use client';
import { useActionState } from 'react';
import { recordAdjustmentAction } from './actions';

export function AdjustmentForm({ products, locations }: {
  products: Array<{ id: number; name: string; baseUnit: string }>;
  locations: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState(recordAdjustmentAction, {});
  return (
    <form action={action} className="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-2 text-sm">
      <select name="productId" className="border rounded p-2" required>
        <option value="">— produit —</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.baseUnit})</option>)}
      </select>
      <select name="locationId" className="border rounded p-2" required>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <input name="qty" type="number" step="0.001" placeholder="Quantité (+/−)"
        className="border rounded p-2" required />
      <input name="reason" placeholder="Motif obligatoire" className="border rounded p-2" required />
      {state.error && <p className="text-red-600 col-span-2">{state.error}</p>}
      <button disabled={pending} className="bg-indigo-600 text-white rounded p-2 col-span-2 font-semibold">
        Enregistrer l'ajustement
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Vérification manuelle** — créer un ajustement −2 avec motif → visible dans le journal, stock modifié.

- [ ] **Step 7: Commit**

```bash
git add src/lib/adjustments.ts src/app/\(protected\)/admin/ajustements/ tests/integration/adjustments.test.ts
git commit -m "feat: ajustements admin avec motif + journal des mouvements"
```

### Task 24: Suite complète, déploiement Vercel et recette manuelle

**Files:**
- Modify: `README.md` (instructions de déploiement)

- [ ] **Step 1: Toute la suite de tests passe**

Run: `npm test`
Expected: tous les tests PASS (unit + integration).

Run: `npm run build`
Expected: build Next.js sans erreur TypeScript.

- [ ] **Step 2: Provisionner la base et déployer**

```bash
npm i -g vercel        # si absent
vercel link            # créer/lier le projet
# Dans le dashboard Vercel : Marketplace -> Neon -> créer la base (DATABASE_URL injectée)
# Settings -> Environment Variables : ajouter SESSION_SECRET (32+ caractères aléatoires)
vercel env pull .env.local
npm run db:migrate     # applique les migrations sur Neon
ADMIN_PASSWORD=<mot-de-passe-fort> npm run db:seed
vercel --prod
```

- [ ] **Step 3: Recette manuelle sur smartphone (journée type)**

Sur l'URL de production, avec les comptes créés par l'admin :
1. Admin : créer 3 produits (Castel casier×12, Poulet kg, Whisky L), 3 articles de vente avec fiches (« Castel 65cl » = 1 bouteille ; « Poulet DG » = 0.4 kg ; « Whisky (verre) » = 0.04 L), 1 compte par rôle.
2. Barman : commander 3 casiers de Castel.
3. Magasinier : livrer 2 casiers + 5 bouteilles (écart).
4. Barman : confirmer 28 reçues (nouvel écart) → stock = 28.
5. Barman : saisir sorties du service : 24 Castel.
6. Comptable : uploader un CSV `Article;Quantité` avec `Castel 65cl;24` → rapprochement : écart 0. Refaire avec 26 vendues → écart −2 (−1 300 FCFA) affiché en rouge.
7. Barman : inventaire — compter 3 (au lieu de 4 théorique) → écart −1 tracé, stock ajusté.
8. Vérifier le tableau de bord comptable : valeurs, alertes, dernier inventaire.
9. Vérifier les permissions : URL /admin/produits en tant que barman → redirigé.

- [ ] **Step 4: README**

Rédiger `README.md` : description du projet en 3 phrases, prérequis, `npm install`, variables d'environnement (`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD` pour le seed), commandes (`npm run dev`, `npm test`, `npm run db:migrate`, `npm run db:seed`), procédure de déploiement Vercel ci-dessus, et le lien vers la spec (`docs/superpowers/specs/2026-07-11-gestion-stock-design.md`).

- [ ] **Step 5: Commit final**

```bash
git add README.md
git commit -m "docs: README (installation, env, déploiement)"
```

---

## Auto-révision du plan (faite à la rédaction)

**Couverture de la spec :** circuit commande→livraison→réception (T13-15), sorties (T16), fiches techniques (T11), import + correspondances mémorisées (T19, T21), rapprochement valorisé (T20-21), conditionnements (T5, T14), inventaire hebdo (T18), stock en un coup d'œil + seuils (T17, T22), 5 rôles + comptes individuels (T6-8, T10), ajustements admin avec motif (T23), immuabilité du journal (INSERT uniquement, T12+), stock négatif alerté non bloqué (T16), date de service modifiable (T16), déploiement + recette (T24). Aucune section de la spec sans tâche.

**Points d'attention pour l'exécutant :**
- Deux blocs de code contiennent une correction signalée juste en dessous (T14 : `and()` au lieu de deux `.where()` ; T16 : requête produit directe) — appliquer la version corrigée.
- T21 : nettoyer le commentaire de `matchImportLine` comme indiqué.
- Les APIs Next.js évoluent : si `useActionState` ou `params: Promise<...>` diffèrent dans la version installée, suivre la doc de la version du projet (le skill vercel:nextjs peut aider).
- Protection double soumission : assurée par les gardes de statut (`en_attente`/`livree`) pour commandes ; pour les sorties/inventaires, le bouton se désactive pendant l'envoi (`pending`) — jugé suffisant en v1.




