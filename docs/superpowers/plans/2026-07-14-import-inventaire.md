# Plan d'implémentation — Import Excel/CSV d'inventaire

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'admin importe un fichier de comptage (template téléchargeable) pour Bar ou Cuisine ; l'import résout les noms de produits (suggestions), délègue à `validateInventory` INTOUCHÉE et affiche le rapport avec les écarts valorisés.

**Architecture:** Ajouts purs dans templates.ts + route (type `inventaire`) ; nouvelle lib `import-inventory.ts` (TDD) qui appelle UNE fois `validateInventory` ; 3ᵉ carte sur /admin/imports avec formulaire dédié (Emplacement + Date). Aucune migration.

**Tech Stack:** Existant — Next 16, Drizzle/PGlite, xlsx, Vitest.

**Spec :** `docs/superpowers/specs/2026-07-14-import-inventaire-design.md`

---

## Structure des fichiers

```
src/lib/templates.ts                   # MODIFIÉ : INVENTORY_HEADERS + type 'inventaire' (ajouts purs)
src/app/(protected)/admin/imports/template/route.ts  # MODIFIÉ : type inventaire accepté
src/lib/import-inventory.ts            # NOUVEAU : importInventory + InventoryImportReport
src/app/(protected)/admin/imports/actions.ts         # MODIFIÉ : + importInventoryAction
src/app/(protected)/admin/imports/inventory-import-form.tsx  # NOUVEAU (client)
src/app/(protected)/admin/imports/page.tsx           # MODIFIÉ : 3ᵉ carte + chargement emplacements
tests/unit/inventory-template.test.ts  # NOUVEAU : 2 tests
tests/integration/import-inventory.test.ts  # NOUVEAU : 6 tests
README.md                              # MODIFIÉ (T4)
```

**Conventions :** branche `feature/import-inventaire` (créée, spec a7a3e38) ; sanity départ **190 tests / 34 fichiers** ; `validateInventory`, `parseTable`, `ImportForm` INTOUCHÉS ; aucun test existant modifié ; lint 0/0.

---

### Task 1: Template + route `inventaire` (TDD)

**Files:**
- Modify: `src/lib/templates.ts`, `src/app/(protected)/admin/imports/template/route.ts`
- Test: `tests/unit/inventory-template.test.ts` (nouveau)

- [ ] **Step 1: Tests qui échouent** — créer `tests/unit/inventory-template.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTemplate, INVENTORY_HEADERS } from '@/lib/templates';
import { parseTable } from '@/lib/import-table';

describe('buildTemplate inventaire', () => {
  it('xlsx : 1re feuille = en-têtes seuls, 2e feuille Exemples, reconnu par parseTable', () => {
    const t = buildTemplate('inventaire', 'xlsx');
    expect(t.filename).toBe('template-inventaire.xlsx');
    const wb = XLSX.read(t.buffer, { type: 'buffer' });
    expect(wb.SheetNames.length).toBe(2);
    expect(wb.SheetNames[1]).toBe('Exemples');
    const res = parseTable(t.buffer, t.filename, [...INVENTORY_HEADERS]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Aucune ligne'); // en-têtes ok, zéro données
  });
  it('csv : BOM + en-têtes Produit;Quantité comptée', () => {
    const t = buildTemplate('inventaire', 'csv');
    expect(t.filename).toBe('template-inventaire.csv');
    const text = t.buffer.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).trim()).toBe('Produit;Quantité comptée');
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** dans `src/lib/templates.ts` (ajouts purs — lire le fichier d'abord) :

```ts
export const INVENTORY_HEADERS = ['Produit', 'Quantité comptée'] as const;
```

Élargir le type d'EXAMPLES et de buildTemplate à `'produits' | 'articles' | 'inventaire'` et ajouter :

```ts
  inventaire: [
    ['Castel 65cl', '18'],
    ['Poulet', '2,5'],
    ['Règles : une ligne par produit compté. Les produits absents du fichier ne sont PAS comptés et gardent leur stock. Virgules décimales acceptées.'],
  ],
```

Sélection des en-têtes dans buildTemplate :

```ts
  const headers = type === 'produits' ? [...PRODUCT_HEADERS]
    : type === 'articles' ? [...ARTICLE_HEADERS] : [...INVENTORY_HEADERS];
```

Dans la route `template/route.ts`, étendre la validation :

```ts
  if ((type !== 'produits' && type !== 'articles' && type !== 'inventaire')
    || (format !== 'xlsx' && format !== 'csv')) {
```

- [ ] **Step 4:** Run ciblé → 2 verts. Full `npm test` → 192 (190 + 2). tsc, lint 0/0, `npm run build`.
- [ ] **Step 5: Commit** — `feat(imports): template inventaire téléchargeable (TDD)`

### Task 2: importInventory (TDD)

**Files:**
- Create: `src/lib/import-inventory.ts`
- Test: `tests/integration/import-inventory.test.ts` (nouveau)

- [ ] **Step 1: Tests qui échouent** — créer `tests/integration/import-inventory.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct, archiveProduct } from '@/lib/products';
import { importInventory } from '@/lib/import-inventory';
import { stockMovements } from '@/db/schema';

const row = (line: number, produit: string, qty: string) => ({
  line, cells: { 'Produit': produit, 'Quantité comptée': qty },
});

// Pose un stock théorique par une réception directe dans le journal.
async function giveStock(db: Awaited<ReturnType<typeof createTestDb>>,
  productId: number, locationId: number, qty: number, userId: number) {
  await db.insert(stockMovements).values({
    productId, locationId, type: 'reception', qty: String(qty), userId,
  });
}

describe('importInventory', () => {
  it('comptage nominal : écarts corrects et mouvements ajustement_inventaire créés', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650 });
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await giveStock(db, castel.id!, bar.id, 24, admin.id);
    await giveStock(db, riz.id!, bar.id, 10, admin.id);
    const res = await importInventory(db, [
      row(2, 'castel 65CL', '20'),   // écart -4 (nom normalisé)
      row(3, 'Riz', '10'),           // écart 0
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.counted).toBe(2);
    expect(res.report!.rejects).toHaveLength(0);
    const castelGap = res.report!.gaps.find((g) => g.productId === castel.id);
    expect(castelGap).toMatchObject({ qtyTheoretical: 24, qtyCounted: 20, gap: -4, gapValue: -2600 });
    const movements = await db.select().from(stockMovements).where(and(
      eq(stockMovements.type, 'ajustement_inventaire'),
      eq(stockMovements.productId, castel.id!),
    ));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].qty)).toBe(-4);
  });
  it('produit introuvable : rejet avec suggestion, les autres lignes passent', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const plantain = await saveProduct(db, { name: 'Plantain', baseUnit: 'kg', purchasePrice: 800 });
    await giveStock(db, plantain.id!, bar.id, 5, admin.id);
    const res = await importInventory(db, [
      row(2, 'Plantin', '3'),   // faute -> suggestion
      row(3, 'Plantain', '4'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.counted).toBe(1);
    expect(res.report!.rejects).toHaveLength(1);
    expect(res.report!.rejects[0].reason).toContain('Plantain'); // « vouliez-vous … »
  });
  it('quantités : négative et non numérique rejetées, zéro valide (compté à zéro)', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await giveStock(db, riz.id!, bar.id, 8, admin.id);
    const res = await importInventory(db, [
      row(2, 'Riz', '0'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.gaps[0]).toMatchObject({ qtyCounted: 0, gap: -8 });
    const res2 = await importInventory(db, [
      row(2, 'Riz', '-1'),
      row(3, 'Riz', 'abc'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res2.ok).toBe(false);
    expect(res2.report!.rejects).toHaveLength(2);
  });
  it('doublon interne : la dernière ligne fait foi, duplicates incrémenté', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const riz = await saveProduct(db, { name: 'Riz', baseUnit: 'kg', purchasePrice: 500 });
    await giveStock(db, riz.id!, bar.id, 8, admin.id);
    const res = await importInventory(db, [
      row(2, 'Riz', '5'),
      row(3, 'riz', '6'), // dernière fait foi
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.duplicates).toBe(1);
    expect(res.report!.counted).toBe(1);
    expect(res.report!.gaps[0]).toMatchObject({ qtyCounted: 6, gap: -2 });
  });
  it('zéro ligne valide : ok:false mais le rapport expose les rejets', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const res = await importInventory(db, [
      row(2, 'Inconnu', '5'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Aucune ligne');
    expect(res.report!.rejects).toHaveLength(1);
  });
  it('produit archivé compté : accepté', async () => {
    const db = await createTestDb();
    const { bar, admin } = await seedBase(db);
    const vieux = await saveProduct(db, { name: 'Vieux Produit', baseUnit: 'kg', purchasePrice: 100 });
    await giveStock(db, vieux.id!, bar.id, 3, admin.id);
    await archiveProduct(db, vieux.id!, true);
    const res = await importInventory(db, [
      row(2, 'Vieux Produit', '2'),
    ], { locationId: bar.id, inventoryDate: '2026-07-14', countedBy: admin.id });
    expect(res.ok).toBe(true);
    expect(res.report!.gaps[0]).toMatchObject({ qtyCounted: 2, gap: -1 });
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** `src/lib/import-inventory.ts` :

```ts
import { products } from '@/db/schema';
import { validateInventory, type InventoryGap } from './inventories';
import { normalizeText, suggestClosest } from './text';
import { toNumber, type ParsedRow } from './import-table';
import type { AnyDb } from '@/db';

export interface InventoryImportReport {
  counted: number; duplicates: number;
  rejects: Array<{ line: number; reason: string }>;
  gaps: InventoryGap[];
}

// Import d'un comptage d'inventaire (spec import-inventaire §3) : résout les noms
// de produits (normalisés, suggestions), puis délègue TOUT le métier à
// validateInventory (écarts, mouvements ajustement_inventaire, statut). Les
// produits archivés restent comptables (on peut inventorier un produit retiré
// encore en rayon). Les rejets ne bloquent pas les lignes valides ; les produits
// absents du fichier ne sont pas comptés (stock intact).
export async function importInventory(
  db: AnyDb, rows: ParsedRow[],
  opts: { locationId: number; inventoryDate: string; countedBy: number },
): Promise<{ ok: boolean; error?: string; report?: InventoryImportReport }> {
  const report: InventoryImportReport = { counted: 0, duplicates: 0, rejects: [], gaps: [] };

  const prods: Array<{ id: number; name: string }> = await db.select({
    id: products.id, name: products.name,
  }).from(products);
  const byName = new Map(prods.map((p) => [normalizeText(p.name), p]));
  const names = prods.map((p) => p.name);

  // Dernière ligne fait foi par produit (un comptage ne s'additionne pas —
  // même convention que la fusion de validateInventory).
  const byProduct = new Map<number, number>();
  for (const r of rows) {
    const raw = (r.cells['Produit'] ?? '').trim();
    if (!raw) { report.rejects.push({ line: r.line, reason: 'Produit manquant' }); continue; }
    const prod = byName.get(normalizeText(raw));
    if (!prod) {
      const s = suggestClosest(raw, names);
      report.rejects.push({
        line: r.line,
        reason: `Produit « ${raw} » introuvable${s ? ` — vouliez-vous « ${s} » ?` : ''}`,
      });
      continue;
    }
    const qtyRaw = (r.cells['Quantité comptée'] ?? '').trim();
    const qty = toNumber(qtyRaw);
    if (qty == null || qty < 0) {
      report.rejects.push({ line: r.line, reason: `Quantité invalide : « ${qtyRaw} »` });
      continue;
    }
    if (byProduct.has(prod.id)) report.duplicates++;
    byProduct.set(prod.id, qty);
  }

  if (byProduct.size === 0) {
    return { ok: false, error: 'Aucune ligne exploitable', report };
  }

  const res = await validateInventory(db, {
    locationId: opts.locationId, inventoryDate: opts.inventoryDate, countedBy: opts.countedBy,
    lines: [...byProduct.entries()].map(([productId, qtyCounted]) => ({ productId, qtyCounted })),
  });
  if (!res.ok) return { ok: false, error: res.error, report };

  report.counted = byProduct.size;
  report.gaps = res.gaps ?? [];
  return { ok: true, report };
}
```

- [ ] **Step 4:** Run ciblé → 6 verts. Full → 198 (192 + 6). tsc, lint 0/0.
- [ ] **Step 5: Commit** — `feat(imports): import d'inventaire délégué à validateInventory (TDD)`

### Task 3: UI — action + formulaire + 3ᵉ carte

**Files:**
- Modify: `src/app/(protected)/admin/imports/actions.ts`, `src/app/(protected)/admin/imports/page.tsx`
- Create: `src/app/(protected)/admin/imports/inventory-import-form.tsx`

- [ ] **Step 1 (actions.ts)** — lire le fichier ; ajouter (imports à compléter : `importInventory, type InventoryImportReport` depuis '@/lib/import-inventory', `INVENTORY_HEADERS` à l'import templates existant, `isValidDateString` depuis '@/lib/dates', `formNumber` depuis '@/lib/forms', `locations` depuis '@/db/schema', `and, eq, ne` depuis 'drizzle-orm' selon besoin) :

```ts
export type InventoryImportFormState = { error?: string; report?: InventoryImportReport };

export async function importInventoryAction(
  _prev: InventoryImportFormState, formData: FormData,
): Promise<InventoryImportFormState> {
  const session = await requireRole(['admin']);
  const file = formData.get('file') as File | null;
  if (!file || !file.size) return { error: 'Choisissez un fichier CSV ou Excel' };
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'Fichier trop volumineux (4 Mo maximum)' };
  const locationId = formNumber(formData, 'locationId');
  if (locationId == null) return { error: 'Emplacement invalide' };
  // L'emplacement doit exister et être journalisé (bar/cuisine — pas le magasin, suivi dans Odoo).
  const [loc] = await db.select({ id: locations.id }).from(locations)
    .where(and(eq(locations.id, locationId), ne(locations.type, 'magasin')));
  if (!loc) return { error: 'Emplacement invalide' };
  const inventoryDate = String(formData.get('inventoryDate') ?? '').trim();
  if (!isValidDateString(inventoryDate)) return { error: "Date d'inventaire invalide" };
  const parsed = parseTable(Buffer.from(await file.arrayBuffer()), file.name, [...INVENTORY_HEADERS]);
  if (!parsed.ok) return { error: parsed.error };
  try {
    const res = await importInventory(db, parsed.rows, {
      locationId, inventoryDate, countedBy: session.userId,
    });
    if (res.ok) {
      for (const p of ['/admin/imports', '/stock', '/inventaire', '/compta/mouvements']) revalidatePath(p);
      return { report: res.report };
    }
    return { error: res.error, report: res.report };
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
}
```

- [ ] **Step 2 (inventory-import-form.tsx, NOUVEAU client)** — s'inspirer d'import-form.tsx (lire) :

```tsx
'use client';
import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Select, DateField } from '@/components/ui/fields';
import { importInventoryAction, type InventoryImportFormState } from './actions';

export function InventoryImportForm({ locations, today }: {
  locations: Array<{ id: number; name: string }>; today: string;
}) {
  const [state, formAction, pending] = useActionState(importInventoryAction, {} as InventoryImportFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.report && !state.error) formRef.current?.reset();
  }, [state]);
  const nf = (n: number) => n.toLocaleString('fr-FR');
  return (
    <form ref={formRef} action={formAction} className="space-y-3 text-sm">
      <input name="file" type="file" accept=".csv,.xlsx,.xls" required
        className="block w-full text-muted file:mr-3 file:rounded-[10px] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-cream" />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-muted text-xs">Emplacement</span>
          <Select name="locationId" required defaultValue="" className="w-full">
            <option value="" disabled>— emplacement —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select></label>
        <label className="space-y-1"><span className="text-muted text-xs">Date d&apos;inventaire</span>
          <DateField name="inventoryDate" defaultValue={today} required className="w-full" /></label>
      </div>
      <FormError message={state.error} />
      {state.report && (
        <div className="bg-card border border-line rounded-xl p-3 space-y-2">
          <p className={state.error ? 'text-negative font-semibold' : 'text-success font-semibold'}>
            {state.report.counted} produit(s) compté(s)
            {state.report.duplicates > 0 && ` · ${state.report.duplicates} doublon(s) de fichier`}
            {' · '}{state.report.rejects.length} rejeté(s)
          </p>
          {state.report.rejects.map((r, i) => (
            <p key={i} className="text-negative text-xs">ligne {r.line} : {r.reason}</p>
          ))}
          {state.report.gaps.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted uppercase tracking-wider">
                  <th className="p-1">Produit</th><th>Théorique</th><th>Compté</th><th>Écart</th><th className="text-right p-1">FCFA</th>
                </tr></thead>
                <tbody>
                  {state.report.gaps.map((g) => (
                    <tr key={g.productId} className={`border-t border-line ${g.gap !== 0 ? 'bg-negative/10' : ''}`}>
                      <td className="p-1 text-cream">{g.name}</td>
                      <td className="tnum text-cream">{g.qtyTheoretical}</td>
                      <td className="tnum text-cream">{g.qtyCounted}</td>
                      <td className={g.gap !== 0 ? 'text-negative tnum font-semibold' : 'tnum text-cream'}>
                        {g.gap > 0 ? '+' : ''}{g.gap}</td>
                      <td className="text-right p-1 tnum text-cream">{nf(g.gapValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <Button type="submit" pending={pending} className="w-full">Importer l&apos;inventaire</Button>
    </form>
  );
}
```

- [ ] **Step 3 (page.tsx)** — lire le fichier ; ajouter le chargement des emplacements et la date du jour (imports : db, locations, ne, asc, et un helper local de date comme mouvements/page.tsx) puis la 3ᵉ carte après celle des articles :

```tsx
      <Card className="p-4 space-y-3">
        <h2 className="font-display text-lg font-bold text-cream">Inventaire</h2>
        <p className="text-sm text-muted">
          Compte uniquement les produits listés dans le fichier — les absents gardent leur stock.
          L&apos;import crée un inventaire et ses ajustements, comme une saisie manuelle.
        </p>
        <TemplateLinks type="inventaire" />
        <InventoryImportForm locations={locs} today={today} />
      </Card>
```

(`TemplateLinks` existant : élargir son type de prop à `'produits' | 'articles' | 'inventaire'` — changement local à la page.)

- [ ] **Step 4:** `npm test` (198), tsc, lint 0/0, `npm run build`.
- [ ] **Step 5: Commit** — `feat(admin): carte d'import d'inventaire (emplacement + date + rapport d'écarts)`

### Task 4: Balayage + README (vérif navigateur par le CONTRÔLEUR ensuite)

- [ ] **Step 1:** `npm test` → **198 tests / 36 fichiers attendus** (190 + 8). tsc, lint 0/0, build (routes inchangées + page imports recompilée).
- [ ] **Step 2:** Greps : `git diff a7a3e38..HEAD --stat` → uniquement les fichiers de la structure ; `grep -n 'validateInventory' src/lib/inventories.ts` inchangé (diff vide sur ce fichier) ; le formulaire inventaire a exactement un type="submit".
- [ ] **Step 3:** README : étendre la phrase de la page Imports (templates produits/articles/inventaire, import de comptage avec écarts).
- [ ] **Step 4: Commit** — `docs: README — import d'inventaire`

---

## Auto-révision du plan

**Couverture spec :** §2 (T1 — headers, exemples avec règle des absents, route étendue, filenames), §3 (T2 — résolution normalisée avec archivés, suggestions, 0 valide, doublons dernier-gagnant, rejets non bloquants, zéro-valide avec rapport, délégation unique, gaps remontés), §4 (T3 — carte, formulaire dédié avec Emplacement/Date, plafond 4 Mo, validation emplacement non-magasin + date, revalidatePath ×4 en succès seulement, tableau des écarts aux conventions rapprochement, reset après succès, ImportForm intouché), §5 (sémantique dans le texte d'aide + template), §6 (8 tests ~ les 6 de la spec en 6 blocs), §7 (vérif contrôleur post-T4), §8 (aucune migration, libs intouchées).

**Points d'attention exécutant :**
- Comptes de tests indicatifs (190→192→198) ; aucun test existant modifié.
- T1 : élargir le type union de buildTemplate/EXAMPLES est un changement de SIGNATURE compatible (les appels existants passent toujours) — pas une modification de logique.
- T2 : `archiveProduct` importé dans le test vient de la phase précédente (products.ts) — vérifier l'export.
- T3 : le rapport s'affiche AUSSI quand ok:false avec rejets (state.error + state.report coexistent — le formulaire ne reset que si report && !error).
- T3 : `formNumber` est dans '@/lib/forms' (vérifier l'export exact — utilisé par les actions utilisateurs).
- T3 : ne PAS toucher ImportForm ni les deux cartes existantes.
