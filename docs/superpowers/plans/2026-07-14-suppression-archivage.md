# Plan d'implémentation — Suppression et archivage des produits et articles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'admin peut supprimer définitivement les produits/articles jamais référencés, et archiver (= désactiver, état unifié) ceux qui ont un historique — badge et boutons directement dans les listes admin.

**Architecture:** 1 migration (colonne `active` sur sale_articles — la première depuis la v1) + fonctions delete/archive TDD dans les libs existantes (ajouts purs) + server actions et boutons par ligne dans les listes. Vérification navigateur en fin de phase par le contrôleur.

**Tech Stack:** Existant — Next 16, Drizzle/drizzle-kit, PGlite, Vitest.

**Spec :** `docs/superpowers/specs/2026-07-14-suppression-archivage-design.md`

---

## Structure des fichiers

```
src/db/schema.ts                       # MODIFIÉ : active sur saleArticles
drizzle/0005_*.sql                     # NOUVEAU : généré par drizzle-kit
src/lib/products.ts                    # MODIFIÉ : + deleteProduct, archiveProduct, getReferencedProductIds (ajouts purs)
src/lib/sale-articles.ts               # MODIFIÉ : + deleteSaleArticle, archiveSaleArticle, getReferencedArticleIds (ajouts purs)
src/app/(protected)/admin/produits/actions.ts        # MODIFIÉ : + deleteProductAction, archiveProductAction
src/app/(protected)/admin/produits/page.tsx          # MODIFIÉ : passe deletable/archivé à la liste
src/app/(protected)/admin/produits/product-list.tsx  # MODIFIÉ : boutons par ligne
src/app/(protected)/admin/articles/actions.ts        # MODIFIÉ : + deleteSaleArticleAction, archiveSaleArticleAction
src/app/(protected)/admin/articles/page.tsx          # MODIFIÉ : badge + actions par carte
src/app/(protected)/admin/articles/article-actions.tsx  # NOUVEAU : petit composant client par carte
src/app/(protected)/compta/imports/page.tsx          # MODIFIÉ : articles actifs seuls vers match-form
src/app/(protected)/compta/mouvements/page.tsx       # MODIFIÉ : suffixe « (archivé) » filtre Article
tests/integration/delete-archive.test.ts             # NOUVEAU : ~12 tests
README.md                              # MODIFIÉ (T6)
```

**Conventions :** branche `feature/suppression-archivage` (créée, spec 2ecf9aa) ; sanity départ **178 tests / 33 fichiers** ; ajouts purs dans les libs ; aucun test existant modifié ; lint 0/0.

---

### Task 1: Migration `active` sur sale_articles

**Files:**
- Modify: `src/db/schema.ts`
- Create (généré): `drizzle/0005_*.sql`

- [ ] **Step 1:** Dans `src/db/schema.ts`, table `saleArticles`, ajouter après `locationId` :

```ts
  active: boolean('active').notNull().default(true),
```

- [ ] **Step 2:** Générer la migration : `npx drizzle-kit generate` (lire `drizzle.config.ts` d'abord pour confirmer la commande/config). Vérifier que le SQL généré (`drizzle/0005_*.sql`) contient EXACTEMENT un `ALTER TABLE "sale_articles" ADD COLUMN "active" boolean DEFAULT true NOT NULL;` et rien d'autre. Si drizzle-kit génère autre chose (recréation de table, etc.) → STOP, BLOCKED avec le SQL généré.
- [ ] **Step 3:** Full `npm test` → **178 verts inchangés** (les tests migrent via ./drizzle : la colonne arrive avec son défaut, aucun insert existant ne la mentionne). `npx tsc --noEmit`, `npm run lint` 0/0, `npm run build`.
- [ ] **Step 4: Commit** — `feat(db): colonne active sur sale_articles (migration 0005)`

### Task 2: deleteProduct + archiveProduct + getReferencedProductIds (TDD)

**Files:**
- Modify: `src/lib/products.ts` (ajouts purs en fin de fichier)
- Test: `tests/integration/delete-archive.test.ts` (nouveau — la partie produits)

- [ ] **Step 1: Tests qui échouent** — créer `tests/integration/delete-archive.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, deleteProduct, archiveProduct, getReferencedProductIds } from '@/lib/products';
import { saveSaleArticle } from '@/lib/sale-articles';
import { createOrder } from '@/lib/orders';
import { products, saleArticles, stockMovements } from '@/db/schema';

describe('deleteProduct', () => {
  it('supprime un produit jamais référencé', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const res = await deleteProduct(db, riz.id!);
    expect(res.ok).toBe(true);
    expect(await db.select().from(products).where(eq(products.id, riz.id!))).toHaveLength(0);
  });
  it('refuse quand une fiche technique le référence (motif « fiche »)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const res = await deleteProduct(db, castel.id!);
    expect(res.ok).toBe(false);
    expect(res.referenced).toBe(true);
    expect(res.error).toContain('fiche');
    expect(res.error).toContain('archivez');
    expect(await db.select().from(products).where(eq(products.id, castel.id!))).toHaveLength(1);
  });
  it('refuse quand un mouvement de stock existe (motif « mouvement »)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await db.insert(stockMovements).values({
      productId: riz.id!, locationId: bar.id, type: 'reception', qty: '5', userId: barman.id,
    });
    const res = await deleteProduct(db, riz.id!);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('mouvement');
  });
  it('refuse quand une commande le référence, même sans mouvement (motif « commande »)', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await createOrder(db, { locationId: bar.id, createdBy: barman.id, lines: [{ productId: riz.id!, qtyRequested: 2 }] });
    const res = await deleteProduct(db, riz.id!);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('commande');
  });
  it('produit introuvable -> erreur', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await deleteProduct(db, 999999)).ok).toBe(false);
  });
});

describe('archiveProduct', () => {
  it('archive puis désarchive (bascule active), idempotent', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    expect((await archiveProduct(db, riz.id!, true)).ok).toBe(true);
    let [row] = await db.select().from(products).where(eq(products.id, riz.id!));
    expect(row.active).toBe(false);
    expect((await archiveProduct(db, riz.id!, true)).ok).toBe(true); // idempotent
    expect((await archiveProduct(db, riz.id!, false)).ok).toBe(true);
    [row] = await db.select().from(products).where(eq(products.id, riz.id!));
    expect(row.active).toBe(true);
    expect((await archiveProduct(db, 999999, true)).ok).toBe(false);
  });
});

describe('getReferencedProductIds', () => {
  it('retourne les ids référencés quelque part (fiche + mouvement), pas les autres', async () => {
    const db = await createTestDb();
    const { bar, barman } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    const libre = await saveProduct(db, { name: 'Libre', baseUnit: 'kg', purchasePrice: 100 });
    await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    await db.insert(stockMovements).values({
      productId: riz.id!, locationId: bar.id, type: 'reception', qty: '5', userId: barman.id,
    });
    const refs = await getReferencedProductIds(db);
    expect(refs.has(castel.id!)).toBe(true);
    expect(refs.has(riz.id!)).toBe(true);
    expect(refs.has(libre.id!)).toBe(false);
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** (fin de `src/lib/products.ts` — vérifier les imports existants du fichier, ajouter ceux qui manquent : `recipeLines, orderLines, stockMovements, serviceExitLines, inventoryLines` depuis '@/db/schema', `sql` depuis 'drizzle-orm') :

```ts
// Tables référençant un produit, avec leur libellé de motif (spec suppression §3.1).
const PRODUCT_REFS = [
  { table: recipeLines, label: 'fiche(s) technique(s)' },
  { table: orderLines, label: 'ligne(s) de commande' },
  { table: stockMovements, label: 'mouvement(s) de stock' },
  { table: serviceExitLines, label: 'sortie(s) de service' },
  { table: inventoryLines, label: "ligne(s) d'inventaire" },
] as const;

// Suppression définitive : uniquement si AUCUNE référence nulle part.
// Sinon, motif détaillé et invitation à archiver (spec §3.1).
export async function deleteProduct(db: AnyDb, id: number):
  Promise<{ ok: boolean; referenced?: boolean; error?: string }> {
  const [target] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  if (!target) return { ok: false, error: 'Produit introuvable' };
  const details: string[] = [];
  for (const ref of PRODUCT_REFS) {
    const [row] = await db.select({ n: sql<number>`count(*)::int` })
      .from(ref.table).where(eq(ref.table.productId, id));
    if (row.n > 0) details.push(`${row.n} ${ref.label}`);
  }
  if (details.length) {
    return {
      ok: false, referenced: true,
      error: `Produit utilisé (${details.join(', ')}) — archivez-le plutôt`,
    };
  }
  await db.delete(products).where(eq(products.id, id));
  return { ok: true };
}

// Archiver = désactiver (état unifié, spec §3.3). Idempotent.
export async function archiveProduct(db: AnyDb, id: number, archived: boolean):
  Promise<{ ok: boolean; error?: string }> {
  const [target] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  if (!target) return { ok: false, error: 'Produit introuvable' };
  await db.update(products).set({ active: !archived }).where(eq(products.id, id));
  return { ok: true };
}

// Ids de produits référencés quelque part — la liste admin s'en sert pour ne
// proposer « Supprimer » que sur les supprimables (le serveur revérifie via deleteProduct).
export async function getReferencedProductIds(db: AnyDb): Promise<Set<number>> {
  const ids = new Set<number>();
  for (const ref of PRODUCT_REFS) {
    const rows: Array<{ productId: number }> = await db
      .selectDistinct({ productId: ref.table.productId }).from(ref.table);
    for (const r of rows) ids.add(r.productId);
  }
  return ids;
}
```

- [ ] **Step 4:** Run ciblé → 7 verts. Full → 185 (178 + 7). tsc, lint 0/0.
- [ ] **Step 5: Commit** — `feat(admin): suppression et archivage des produits (TDD)`

### Task 3: deleteSaleArticle + archiveSaleArticle + getReferencedArticleIds (TDD)

**Files:**
- Modify: `src/lib/sale-articles.ts` (ajouts purs en fin de fichier)
- Modify: `tests/integration/delete-archive.test.ts` (describes AJOUTÉS — fichier de cette phase)

- [ ] **Step 1: Ajouter les describes** à la fin du fichier de test (compléter les imports : `deleteSaleArticle, archiveSaleArticle, getReferencedArticleIds` depuis '@/lib/sale-articles', `recipeLines, salesImports, salesImportLines` depuis '@/db/schema') :

```ts
describe('deleteSaleArticle', () => {
  it('supprime un article jamais vendu, avec sa fiche (cascade)', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const art = await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const res = await deleteSaleArticle(db, art.id!);
    expect(res.ok).toBe(true);
    expect(await db.select().from(saleArticles).where(eq(saleArticles.id, art.id!))).toHaveLength(0);
    expect(await db.select().from(recipeLines).where(eq(recipeLines.saleArticleId, art.id!))).toHaveLength(0);
    // le produit ingrédient, lui, reste
    expect(await db.select().from(products).where(eq(products.id, castel.id!))).toHaveLength(1);
  });
  it('refuse quand des ventes importées le référencent (motif « vente »)', async () => {
    const db = await createTestDb();
    const { bar, comptable } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const art = await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const [imp] = await db.insert(salesImports).values({
      filename: 'ventes.xlsx', serviceDate: '2026-07-13', uploadedBy: comptable.id,
    }).returning();
    await db.insert(salesImportLines).values({
      importId: imp.id, articleNameRaw: 'Castel 65cl', qty: '3', saleArticleId: art.id!,
    });
    const res = await deleteSaleArticle(db, art.id!);
    expect(res.ok).toBe(false);
    expect(res.referenced).toBe(true);
    expect(res.error).toContain('vente');
    expect(res.error).toContain('archivez');
  });
  it('article introuvable -> erreur', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect((await deleteSaleArticle(db, 999999)).ok).toBe(false);
  });
});

describe('archiveSaleArticle', () => {
  it('archive puis désarchive (bascule active), idempotent', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const art = await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    expect((await archiveSaleArticle(db, art.id!, true)).ok).toBe(true);
    let [row] = await db.select().from(saleArticles).where(eq(saleArticles.id, art.id!));
    expect(row.active).toBe(false);
    expect((await archiveSaleArticle(db, art.id!, true)).ok).toBe(true);
    expect((await archiveSaleArticle(db, art.id!, false)).ok).toBe(true);
    [row] = await db.select().from(saleArticles).where(eq(saleArticles.id, art.id!));
    expect(row.active).toBe(true);
    expect((await archiveSaleArticle(db, 999999, true)).ok).toBe(false);
  });
});

describe('getReferencedArticleIds', () => {
  it('retourne les ids d\'articles vendus, pas les autres', async () => {
    const db = await createTestDb();
    const { bar, comptable } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    const vendu = await saveSaleArticle(db, { cashName: 'Vendu', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const jamais = await saveSaleArticle(db, { cashName: 'Jamais', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const [imp] = await db.insert(salesImports).values({
      filename: 'v.xlsx', serviceDate: '2026-07-13', uploadedBy: comptable.id,
    }).returning();
    await db.insert(salesImportLines).values({
      importId: imp.id, articleNameRaw: 'Vendu', qty: '1', saleArticleId: vendu.id!,
    });
    const refs = await getReferencedArticleIds(db);
    expect(refs.has(vendu.id!)).toBe(true);
    expect(refs.has(jamais.id!)).toBe(false);
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** (fin de `src/lib/sale-articles.ts` ; ajouter aux imports : `salesImportLines` depuis '@/db/schema', `sql, isNotNull` depuis 'drizzle-orm') :

```ts
// Suppression définitive d'un article : uniquement si aucune vente importée ne le
// référence. SA fiche (recipe_lines) est sa composition : elle part en cascade,
// elle ne bloque pas (spec suppression §3.2).
export async function deleteSaleArticle(db: AnyDb, id: number):
  Promise<{ ok: boolean; referenced?: boolean; error?: string }> {
  const [target] = await db.select({ id: saleArticles.id }).from(saleArticles)
    .where(eq(saleArticles.id, id));
  if (!target) return { ok: false, error: 'Article introuvable' };
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(salesImportLines).where(eq(salesImportLines.saleArticleId, id));
  if (row.n > 0) {
    return {
      ok: false, referenced: true,
      error: `Article utilisé (${row.n} vente(s) importée(s)) — archivez-le plutôt`,
    };
  }
  await db.delete(saleArticles).where(eq(saleArticles.id, id)); // recipe_lines: cascade
  return { ok: true };
}

// Archiver = désactiver (état unifié, spec §3.3). Idempotent.
export async function archiveSaleArticle(db: AnyDb, id: number, archived: boolean):
  Promise<{ ok: boolean; error?: string }> {
  const [target] = await db.select({ id: saleArticles.id }).from(saleArticles)
    .where(eq(saleArticles.id, id));
  if (!target) return { ok: false, error: 'Article introuvable' };
  await db.update(saleArticles).set({ active: !archived }).where(eq(saleArticles.id, id));
  return { ok: true };
}

// Ids d'articles référencés par au moins une vente importée (liste admin).
export async function getReferencedArticleIds(db: AnyDb): Promise<Set<number>> {
  const rows: Array<{ saleArticleId: number | null }> = await db
    .selectDistinct({ saleArticleId: salesImportLines.saleArticleId })
    .from(salesImportLines).where(isNotNull(salesImportLines.saleArticleId));
  return new Set(rows.map((r) => r.saleArticleId!));
}
```

- [ ] **Step 4:** Run ciblé → 12 verts au total dans le fichier. Full → 190 (185 + 5). tsc, lint 0/0.
- [ ] **Step 5: Commit** — `feat(admin): suppression et archivage des articles (TDD)`

### Task 4: UI produits (actions + liste)

**Files:**
- Modify: `src/app/(protected)/admin/produits/actions.ts`, `page.tsx`, `product-list.tsx`

- [ ] **Step 1 (actions.ts)** — lire le fichier, suivre ses conventions exactes (formNumber, style des states). Ajouter :

```ts
export type ProductRowState = { error?: string };

export async function deleteProductAction(_prev: ProductRowState, formData: FormData):
  Promise<ProductRowState> {
  await requireRole(['admin']);
  const id = formNumber(formData, 'id');
  if (id == null) return { error: 'Produit invalide' };
  let res: Awaited<ReturnType<typeof deleteProduct>>;
  try {
    res = await deleteProduct(db, id);
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/produits');
  return {};
}

export async function archiveProductAction(_prev: ProductRowState, formData: FormData):
  Promise<ProductRowState> {
  await requireRole(['admin']);
  const id = formNumber(formData, 'id');
  if (id == null) return { error: 'Produit invalide' };
  const archived = formData.get('archived') === '1';
  let res: Awaited<ReturnType<typeof archiveProduct>>;
  try {
    res = await archiveProduct(db, id, archived);
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/produits');
  return {};
}
```

(imports `deleteProduct, archiveProduct` ajoutés à l'import existant de '@/lib/products'. Si le fichier n'a pas `formNumber`, utiliser son équivalent local existant.)

- [ ] **Step 2 (page.tsx)** — calculer la supprimabilité côté serveur : `const referenced = await getReferencedProductIds(db);` puis passer à la liste `products={rows.map((p) => ({ …existant, deletable: !referenced.has(p.id) }))}` (étendre le mapping existant ; lire le code réel pour respecter sa forme).

- [ ] **Step 3 (product-list.tsx)** — étendre `ProductListItem` avec `deletable: boolean`. Le badge existant « inactif » devient « archivé » (`<Badge tone="neutral">archivé</Badge>`). Ajouter dans chaque ListRow, après « Modifier », un composant interne :

```tsx
function RowActions({ id, name, active, deletable }: {
  id: number; name: string; active: boolean; deletable: boolean;
}) {
  const [archState, archAction] = useActionState(archiveProductAction, {});
  const [delState, delAction] = useActionState(deleteProductAction, {});
  return (
    <span className="flex flex-col items-end gap-1 shrink-0">
      <form action={archAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="archived" value={active ? '1' : '0'} />
        <button type="submit" className="text-muted text-xs underline underline-offset-4">
          {active ? 'Archiver' : 'Désarchiver'}
        </button>
      </form>
      {deletable && (
        <form action={delAction}
          onSubmit={(e) => {
            if (!confirm(`Supprimer définitivement « ${name} » ? Cette action est irréversible.`)) e.preventDefault();
          }}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="text-negative text-xs underline underline-offset-4">Supprimer</button>
        </form>
      )}
      <FormError message={archState.error ?? delState.error} />
    </span>
  );
}
```

(imports : `useActionState` de react, `FormError`, les 2 actions. Intégrer `<RowActions id={p.id} name={p.name} active={p.active} deletable={p.deletable} />` dans la ListRow à côté du lien Modifier — adapter la mise en page flex existante proprement.)

- [ ] **Step 4:** `npm test` (190), tsc, lint 0/0, `npm run build`.
- [ ] **Step 5: Commit** — `feat(admin): boutons supprimer/archiver sur la liste des produits`

### Task 5: UI articles + effets de bord compta

**Files:**
- Modify: `src/app/(protected)/admin/articles/actions.ts`, `page.tsx`
- Create: `src/app/(protected)/admin/articles/article-actions.tsx`
- Modify: `src/app/(protected)/compta/imports/page.tsx`, `src/app/(protected)/compta/mouvements/page.tsx`

- [ ] **Step 1 (actions.ts)** — mêmes deux actions que Task 4 (adaptées : `deleteSaleArticleAction`, `archiveSaleArticleAction`, lib sale-articles, revalidatePath '/admin/articles', messages « Article invalide »).
- [ ] **Step 2 (article-actions.tsx, NOUVEAU client)** — même composant RowActions que Task 4 (adapté aux actions articles, exporté `ArticleActions`). C'est un fichier séparé car la liste des articles vit dans le Server Component page.tsx.
- [ ] **Step 3 (admin/articles/page.tsx)** — charger `const referenced = await getReferencedArticleIds(db);` ; dans chaque carte d'article, à côté de « Modifier » : badge `{!a.active && <Badge tone="neutral">archivé</Badge>}` (import Badge) et `<ArticleActions id={a.id} name={a.cashName} active={a.active} deletable={!referenced.has(a.id)} />`. Le select des articles de la page (s'il liste) n'est pas concerné.
- [ ] **Step 4 (compta/imports/page.tsx)** — la liste d'articles passée à `MatchForm` : ajouter `.where(eq(saleArticles.active, true))` au select existant (les archivés disparaissent de la correspondance manuelle ; l'auto-match par nom dans storeSalesImport reste INCHANGÉ — spec §5).
- [ ] **Step 5 (compta/mouvements/page.tsx)** — options du combobox Article : `label: a.cashName + (a.active ? '' : ' (archivé)')` (étendre le select `allArticles` pour inclure `active`).
- [ ] **Step 6:** `npm test` (190), tsc, lint 0/0, `npm run build`.
- [ ] **Step 7: Commit** — `feat(admin): suppression/archivage des articles + effets compta`

### Task 6: Balayage + README (vérif navigateur par le CONTRÔLEUR ensuite)

- [ ] **Step 1:** `npm test` → **190 tests / 34 fichiers attendus** (178 + 12). tsc, lint 0/0, build.
- [ ] **Step 2:** Greps : `git diff 2ecf9aa..HEAD --stat` → uniquement les fichiers de la structure ; `grep -rn 'confirm(' src/app` → match-form (existant) + product-list + article-actions ; chaque nouveau formulaire a son `type="submit"`.
- [ ] **Step 3:** README : mentionner suppression/archivage dans la section admin + la NOTE DE DÉPLOIEMENT : la migration 0005 doit être appliquée sur Neon (`npx drizzle-kit migrate`) avant/avec le déploiement.
- [ ] **Step 4: Commit** — `docs: README — suppression et archivage`

Après T6, le contrôleur : vérification navigateur (spec §7) puis, au merge, APPLIQUER LA MIGRATION SUR NEON avant le déploiement Vercel.

---

## Auto-révision du plan

**Couverture spec :** §2 (T1 — migration unique, garde anti-recréation), §3.1-3.3 (T2/T3 — contrats exacts, motifs français détaillés, cascade fiche propre, idempotence), §3.4 (aucune lib existante modifiée hors ajouts), §4 (T4/T5 — actions conventions maison, confirm, badge, Supprimer conditionnel avec revérification serveur), §5 (T5 — match-form filtré actifs, auto-match intact car storeSalesImport non touché, suffixe (archivé) Mouvements, article-form intact), §6 (12 tests T2+T3), §7 (vérif contrôleur post-T6), §8-9 respectés.

**Points d'attention exécutant :**
- Compte de tests indicatif (178→185→190) ; aucun test existant modifié (delete-archive.test.ts appartient à cette phase, T3 l'étend).
- T1 : si drizzle-kit demande une config interactive ou génère un SQL inattendu → BLOCKED, ne pas improviser.
- T2/T3 : `sql<number>\`count(*)::int\`` — le `::int` évite les strings (convention movement-report).
- T4/T5 : les formulaires par ligne sont de VRAIS <form> imbriqués dans la mise en page de ListRow/Card — vérifier qu'aucun <form> n'est imbriqué dans un autre <form> (invalide HTML) ; la ListRow n'est pas un form, OK.
- T5 : compta/imports/page.tsx — vérifier le nom réel de la variable du select des articles avant d'ajouter le where.
- getReferencedProductIds : 5 selectDistinct — volumes faibles, pas d'optimisation nécessaire.
