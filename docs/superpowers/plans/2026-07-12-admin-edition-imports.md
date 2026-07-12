# Plan d'implémentation — Édition admin + templates & import en masse

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'admin de modifier produits/articles/utilisateurs, et d'importer produits et articles en masse via des templates téléchargeables (.xlsx/.csv), avec option « mettre à jour les existants » et rapport détaillé.

**Architecture:** Nouvelles libs testées en TDD (`updateUser` dans users.ts, `suggestClosest` dans text.ts, `import-table.ts`, `templates.ts`, `import-products.ts`, `import-articles.ts`) ; un route handler GET pour les templates ; une page `/admin/imports` ; pré-remplissage `?edit=<id>` sur les 3 pages admin existantes (les libs `saveProduct`/`saveSaleArticle` gèrent déjà l'update). Aucune migration.

**Tech Stack:** Existant uniquement — Next 16, Drizzle/PGlite, xlsx (SheetJS), Vitest, composants ui/ maison.

**Spec :** `docs/superpowers/specs/2026-07-12-admin-edition-imports-design.md`

---

## Structure des fichiers

```
src/lib/users.ts                 # MODIFIÉ : + updateUser (ajout pur)
src/lib/text.ts                  # MODIFIÉ : + levenshtein, suggestClosest (ajouts purs)
src/lib/import-table.ts          # NOUVEAU : parse générique buffer → lignes {line, cells}
src/lib/templates.ts             # NOUVEAU : en-têtes canoniques + buildTemplate (xlsx/csv)
src/lib/import-products.ts       # NOUVEAU : importProducts + ImportReport
src/lib/import-articles.ts       # NOUVEAU : importArticles
src/app/(protected)/admin/imports/template/route.ts   # NOUVEAU : GET template
src/app/(protected)/admin/imports/page.tsx            # NOUVEAU
src/app/(protected)/admin/imports/actions.ts          # NOUVEAU
src/app/(protected)/admin/imports/import-form.tsx     # NOUVEAU (client, réutilisé ×2)
src/components/ui/bottom-nav.tsx # MODIFIÉ : + icône 'fichiers' (FileUp)
src/app/(protected)/layout.tsx   # MODIFIÉ : + entrée nav admin Imports
src/app/(protected)/admin/{produits,articles,utilisateurs}/…  # MODIFIÉS : édition ?edit=<id>
tests/unit/{text-suggest,import-table,templates}.test.ts       # NOUVEAUX
tests/integration/{update-user,import-products,import-articles}.test.ts  # NOUVEAUX
```

**Conventions transverses (rappel des règles durcies) :**
- Branche de travail dédiée ; `git branch --show-current` avant chaque commit ; sanity : 93 tests / 18 fichiers au départ.
- Boutons de soumission : `type="submit"` EXPLICITE (Button défaut type="button"). Non-soumission : `type="button"`.
- LOGIQUE INTOUCHABLE : aucune modification des libs/actions existantes hors ajouts purs listés ci-dessus.
- Actions serveur : `requireRole(['admin'])` en tête, try/catch → « Service indisponible, veuillez réessayer. », `redirect()` HORS try/catch, revalidatePath en succès seulement, `FormError` pour les erreurs.

---

### Task 1: updateUser (TDD)

**Files:**
- Modify: `src/lib/users.ts` (ajout pur en fin de fichier)
- Test: `tests/integration/update-user.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/integration/update-user.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { createUser, updateUser } from '@/lib/users';
import { verifyPassword } from '@/lib/auth';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('updateUser', () => {
  it('met à jour nom et rôle sans toucher au mot de passe si absent', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    const [before] = await db.select().from(users).where(eq(users.id, barman.id));
    const res = await updateUser(db, { id: barman.id, name: 'Paul Grand', role: 'cuisinier' });
    expect(res.ok).toBe(true);
    const [after] = await db.select().from(users).where(eq(users.id, barman.id));
    expect(after.name).toBe('Paul Grand');
    expect(after.role).toBe('cuisinier');
    expect(after.passwordHash).toBe(before.passwordHash); // inchangé
  });
  it('remplace le mot de passe quand fourni (≥ 8 caractères)', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    expect((await updateUser(db, { id: barman.id, name: 'Bar', role: 'barman', password: 'court' })).ok).toBe(false);
    const res = await updateUser(db, { id: barman.id, name: 'Bar', role: 'barman', password: 'nouveaumdp1' });
    expect(res.ok).toBe(true);
    const [after] = await db.select().from(users).where(eq(users.id, barman.id));
    expect(await verifyPassword('nouveaumdp1', after.passwordHash)).toBe(true);
  });
  it('refuse de retirer le rôle admin au dernier admin actif', async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db); // seul admin du seed
    const res = await updateUser(db, { id: admin.id, name: 'Admin', role: 'comptable' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('dernier admin');
    const [after] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(after.role).toBe('admin'); // rien écrit
  });
  it("accepte le changement de rôle d'un admin s'il en reste un autre actif", async () => {
    const db = await createTestDb();
    const { admin } = await seedBase(db);
    await createUser(db, { name: 'Admin2', username: 'admin2', password: 'motdepasse2', role: 'admin' });
    const res = await updateUser(db, { id: admin.id, name: 'Ex-Admin', role: 'comptable' });
    expect(res.ok).toBe(true);
  });
  it('refuse un utilisateur inconnu, un nom vide, un rôle invalide', async () => {
    const db = await createTestDb();
    const { barman } = await seedBase(db);
    expect((await updateUser(db, { id: 999999, name: 'X', role: 'barman' })).ok).toBe(false);
    expect((await updateUser(db, { id: barman.id, name: '  ', role: 'barman' })).ok).toBe(false);
    expect((await updateUser(db, { id: barman.id, name: 'X', role: 'patron' as never })).ok).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `npm test -- tests/integration/update-user.test.ts` → FAIL (updateUser non exporté)

- [ ] **Step 3: Implémenter** (ajout en fin de `src/lib/users.ts` ; `VALID_ROLES`, `and`, `eq`, `hashPassword` déjà importés/définis dans ce fichier — vérifier) :

```ts
// Édition admin d'un compte : nom, rôle, mot de passe optionnel (vide = conservé).
// Garde symétrique de setUserActive : on ne retire pas le rôle admin au dernier admin actif.
export async function updateUser(db: AnyDb, input: {
  id: number; name: string; role: Role; password?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.name.trim()) return { ok: false, error: 'Le nom est obligatoire' };
  if (!VALID_ROLES.includes(input.role)) return { ok: false, error: 'Rôle invalide' };
  if (input.password && input.password.length < 8) {
    return { ok: false, error: 'Mot de passe : 8 caractères minimum' };
  }
  const [target] = await db.select().from(users).where(eq(users.id, input.id));
  if (!target) return { ok: false, error: 'Utilisateur introuvable' };
  if (target.role === 'admin' && target.active && input.role !== 'admin') {
    const admins = await db.select().from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true)));
    if (admins.length <= 1) {
      return { ok: false, error: "Impossible de retirer le rôle admin au dernier admin actif" };
    }
  }
  const values: { name: string; role: Role; passwordHash?: string } = {
    name: input.name.trim(), role: input.role,
  };
  if (input.password) values.passwordHash = await hashPassword(input.password);
  await db.update(users).set(values).where(eq(users.id, input.id));
  return { ok: true };
}
```

- [ ] **Step 4:** Run `npm test` → tous verts (93 + 5 = 98). `npx tsc --noEmit` propre.
- [ ] **Step 5: Commit** — `git add src/lib/users.ts tests/integration/update-user.test.ts && git commit -m "feat(admin): updateUser avec garde du dernier admin (TDD)"`

### Task 2: suggestClosest (TDD)

**Files:**
- Modify: `src/lib/text.ts` (ajouts purs)
- Test: `tests/unit/text-suggest.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/unit/text-suggest.test.ts
import { describe, it, expect } from 'vitest';
import { suggestClosest } from '@/lib/text';

describe('suggestClosest', () => {
  it('suggère le nom le plus proche à distance ≤ 2 (insensible casse/accents)', () => {
    const candidates = ['Plantain', 'Poulet', 'Castel 65cl'];
    expect(suggestClosest('Plantin', candidates)).toBe('Plantain');   // distance 1
    expect(suggestClosest('poulét', candidates)).toBe('Poulet');      // accents ignorés
    expect(suggestClosest('Whisky', candidates)).toBeNull();          // trop loin
    expect(suggestClosest('castel 65c', candidates)).toBe('Castel 65cl'); // distance 1
  });
  it('retourne null pour une liste vide', () => {
    expect(suggestClosest('X', [])).toBeNull();
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter** (fin de `src/lib/text.ts`) :

```ts
// Distance de Levenshtein classique (itérative, deux rangées).
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

// Suggestion « vouliez-vous … ? » : candidat le plus proche à distance ≤ 2
// (noms normalisés), null sinon. Spec imports §9.
export function suggestClosest(name: string, candidates: string[]): string | null {
  const target = normalizeText(name);
  let best: string | null = null;
  let bestDist = 3;
  for (const c of candidates) {
    const d = levenshtein(target, normalizeText(c));
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= 2 ? best : null;
}
```

- [ ] **Step 4:** `npm test` → verts (98 + 2 = 100). **Step 5: Commit** — `"feat(imports): suggestion de nom proche (Levenshtein ≤ 2, TDD)"`

### Task 3: import-table — parse générique (TDD)

**Files:**
- Create: `src/lib/import-table.ts`
- Test: `tests/unit/import-table.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/unit/import-table.test.ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTable, toNumber } from '@/lib/import-table';

const HEADERS = ['Nom', 'Catégorie', 'Prix'];

function csv(content: string): Buffer { return Buffer.from(content, 'utf-8'); }
function xlsxBuf(rows: (string | number)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Feuille1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseTable', () => {
  it('reconnaît les en-têtes normalisés (casse/accents) et numérote les lignes', () => {
    const res = parseTable(csv('nom;CATEGORIE;prix\nCastel;Bières;650\n;;\nRiz;Vivres;500\n'), 'x.csv', HEADERS);
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { line: 2, cells: { 'Nom': 'Castel', 'Catégorie': 'Bières', 'Prix': '650' } },
      { line: 4, cells: { 'Nom': 'Riz', 'Catégorie': 'Vivres', 'Prix': '500' } }, // ligne 3 vide sautée
    ]);
  });
  it('parse un xlsx et ne lit que la première feuille', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nom', 'Catégorie', 'Prix'], ['Guinness', 'Bières', 800]]), 'Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Exemples', 'ignorés']]), 'Exemples');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = parseTable(buf, 'x.xlsx', HEADERS);
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].cells['Nom']).toBe('Guinness');
  });
  it('rejette des en-têtes manquants ou inconnus avec un message clair', () => {
    expect(parseTable(csv('Nom;Prix\nX;1\n'), 'x.csv', HEADERS).ok).toBe(false);           // Catégorie manquante
    expect(parseTable(csv('Nom;Catégorie;Prix;Bonus\nX;Y;1;2\n'), 'x.csv', HEADERS).ok).toBe(false); // colonne inconnue
  });
  it('rejette un fichier vide ou illisible', () => {
    expect(parseTable(csv(''), 'x.csv', HEADERS).ok).toBe(false);
    expect(parseTable(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), 'x.xlsx', HEADERS).ok).toBe(false);
  });
});

describe('toNumber', () => {
  it('accepte la virgule décimale, refuse le non-numérique', () => {
    expect(toNumber('1,5')).toBe(1.5);
    expect(toNumber('650')).toBe(650);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('')).toBeNull();
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter :**

```ts
// src/lib/import-table.ts
import * as XLSX from 'xlsx';
import { normalizeText } from './text';

export interface ParsedRow { line: number; cells: Record<string, string> }
export interface TableParseResult { ok: boolean; rows: ParsedRow[]; error?: string }

// '1,5' -> 1.5 ; '' / non numérique -> null.
export function toNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Parse la PREMIÈRE feuille d'un CSV/XLSX en lignes objets, clés = en-têtes
// canoniques fournis (reconnus par nom normalisé). Toutes les colonnes attendues
// doivent être présentes, aucune colonne inconnue tolérée (spec imports §8.1).
// raw:false + codepage 65001 : mêmes précautions que sales-file.ts (virgules
// décimales préservées en texte, accents corrects).
export function parseTable(buffer: Buffer, filename: string, expectedHeaders: string[]): TableParseResult {
  let rows: string[][];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('feuille vide');
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as string[][];
  } catch {
    return { ok: false, rows: [], error: `Fichier illisible (${filename}) : format attendu CSV ou Excel` };
  }
  if (!rows.length) return { ok: false, rows: [], error: 'Fichier vide' };

  const headerRow = rows[0].map((h) => String(h ?? '').trim()).filter((h) => h !== '');
  const byNormalized = new Map(expectedHeaders.map((h) => [normalizeText(h), h]));
  const mapping: string[] = []; // index de colonne -> en-tête canonique
  for (const h of headerRow) {
    const canonical = byNormalized.get(normalizeText(h));
    if (!canonical) return { ok: false, rows: [], error: `Colonne inconnue : « ${h} »` };
    mapping.push(canonical);
  }
  const missing = expectedHeaders.filter((h) => !mapping.includes(h));
  if (missing.length) {
    return { ok: false, rows: [], error: `Colonne(s) manquante(s) : ${missing.join(', ')}` };
  }

  const parsed: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i];
    const cells: Record<string, string> = {};
    let hasContent = false;
    mapping.forEach((canonical, col) => {
      const v = String(raw[col] ?? '').trim();
      cells[canonical] = v;
      if (v) hasContent = true;
    });
    if (!hasContent) continue; // ligne vide sautée silencieusement
    parsed.push({ line: i + 1, cells });
  }
  if (!parsed.length) return { ok: false, rows: [], error: 'Aucune ligne de données exploitable' };
  return { ok: true, rows: parsed };
}
```

- [ ] **Step 4:** `npm test` → verts (100 + 5 = 105). **Step 5: Commit** — `"feat(imports): parse générique des tableaux CSV/Excel (TDD)"`

### Task 4: templates.ts + route handler (TDD sur la lib)

**Files:**
- Create: `src/lib/templates.ts`, `src/app/(protected)/admin/imports/template/route.ts`
- Test: `tests/unit/templates.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/unit/templates.test.ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTemplate, PRODUCT_HEADERS, ARTICLE_HEADERS } from '@/lib/templates';
import { parseTable } from '@/lib/import-table';

describe('buildTemplate', () => {
  it('xlsx produits : 1re feuille = en-têtes seuls, 2e feuille Exemples ignorée par parseTable', () => {
    const t = buildTemplate('produits', 'xlsx');
    expect(t.filename).toBe('template-produits.xlsx');
    const wb = XLSX.read(t.buffer, { type: 'buffer' });
    expect(wb.SheetNames.length).toBe(2);
    expect(wb.SheetNames[1]).toBe('Exemples');
    // le template rempli d'aucune ligne est "vide" pour parseTable (en-têtes ok, 0 données)
    const res = parseTable(t.buffer, t.filename, [...PRODUCT_HEADERS]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Aucune ligne');
  });
  it('csv articles : en-têtes seuls, séparateur ;, BOM UTF-8', () => {
    const t = buildTemplate('articles', 'csv');
    expect(t.filename).toBe('template-articles.csv');
    expect(t.contentType).toContain('csv');
    const text = t.buffer.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(text.slice(1).trim()).toBe(ARTICLE_HEADERS.join(';'));
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter :**

```ts
// src/lib/templates.ts
import * as XLSX from 'xlsx';

export const PRODUCT_HEADERS = [
  'Nom', 'Catégorie', 'Unité de base', 'Conditionnement',
  'Taille conditionnement', "Prix d'achat (FCFA)", "Seuil d'alerte",
] as const;

export const ARTICLE_HEADERS = ['Article caisse', 'Emplacement', 'Produit', 'Quantité'] as const;

const EXAMPLES: Record<'produits' | 'articles', string[][]> = {
  produits: [
    ['Castel 65cl', 'Bières', 'bouteille', 'casier', '12', '650', '24'],
    ['Poulet', 'Vivres', 'kg', '', '', '3500', '5'],
    ['Règles : une ligne par produit. Conditionnement et Taille vont ensemble (les deux ou aucun). Prix obligatoire. Virgules décimales acceptées.'],
  ],
  articles: [
    ['Poulet DG', 'Cuisine', 'Poulet', '0,4'],
    ['Poulet DG', 'Cuisine', 'Plantain', '0,2'],
    ['Castel 65cl', 'Bar', 'Castel 65cl', '1'],
    ['Règles : une ligne par ingrédient (l’article est répété). Emplacement : Bar ou Cuisine. Les produits doivent déjà exister.'],
  ],
};

export function buildTemplate(type: 'produits' | 'articles', format: 'xlsx' | 'csv'): {
  buffer: Buffer; filename: string; contentType: string;
} {
  const headers = type === 'produits' ? [...PRODUCT_HEADERS] : [...ARTICLE_HEADERS];
  if (format === 'csv') {
    // BOM pour qu'Excel FR ouvre l'UTF-8 correctement ; séparateur ;
    const buffer = Buffer.from('﻿' + headers.join(';') + '\n', 'utf-8');
    return { buffer, filename: `template-${type}.csv`, contentType: 'text/csv; charset=utf-8' };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers]), 'À remplir');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...EXAMPLES[type]]), 'Exemples');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    buffer, filename: `template-${type}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
```

```ts
// src/app/(protected)/admin/imports/template/route.ts
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { buildTemplate } from '@/lib/templates';

// GET /admin/imports/template?type=produits|articles&format=xlsx|csv
// Le middleware protège déjà /admin/* ; on revérifie le rôle par défense en profondeur.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return new Response('Accès refusé', { status: 403 });
  }
  const type = req.nextUrl.searchParams.get('type');
  const format = req.nextUrl.searchParams.get('format');
  if ((type !== 'produits' && type !== 'articles') || (format !== 'xlsx' && format !== 'csv')) {
    return new Response('Paramètres invalides', { status: 400 });
  }
  const t = buildTemplate(type, format);
  return new Response(new Uint8Array(t.buffer), {
    headers: {
      'Content-Type': t.contentType,
      'Content-Disposition': `attachment; filename="${t.filename}"`,
    },
  });
}
```

- [ ] **Step 4:** `npm test` → verts (105 + 2 = 107) ; `npx tsc --noEmit` ; `npm run build` (le route handler doit compiler).
- [ ] **Step 5: Commit** — `"feat(imports): templates produits/articles xlsx+csv + route de téléchargement"`

### Task 5: importProducts (TDD)

**Files:**
- Create: `src/lib/import-products.ts`
- Test: `tests/integration/import-products.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/integration/import-products.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { importProducts } from '@/lib/import-products';
import { products } from '@/db/schema';
import { eq } from 'drizzle-orm';

const row = (line: number, cells: Record<string, string>) => ({
  line,
  cells: {
    'Nom': '', 'Catégorie': '', 'Unité de base': '', 'Conditionnement': '',
    'Taille conditionnement': '', "Prix d'achat (FCFA)": '', "Seuil d'alerte": '',
    ...cells,
  },
});

describe('importProducts', () => {
  it('crée les nouveaux, ignore les existants (case décochée), rejette les invalides', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, { name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650 });
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Riz', 'Catégorie': 'Vivres', 'Unité de base': 'kg', "Prix d'achat (FCFA)": '500' }),
      row(3, { 'Nom': 'castel 65CL', 'Unité de base': 'bouteille', "Prix d'achat (FCFA)": '700' }), // existant (normalisé)
      row(4, { 'Nom': 'Sans prix', 'Unité de base': 'kg' }), // prix manquant
      row(5, { 'Nom': 'Whisky', 'Unité de base': 'L', "Prix d'achat (FCFA)": 'abc' }), // prix non numérique
    ], { update: false });
    expect(report.created).toBe(1);
    expect(report.ignored).toBe(1);
    expect(report.updated).toBe(0);
    expect(report.rejects).toHaveLength(2);
    expect(report.rejects[0].line).toBe(4);
    // l'existant n'a pas bougé
    const [castel] = await db.select().from(products).where(eq(products.name, 'Castel 65cl'));
    expect(castel.purchasePrice).toBe(650);
  });
  it('met à jour les existants quand update=true ; cellule optionnelle vide = champ effacé', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, {
      name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650,
      packName: 'casier', packSize: 12, alertThreshold: 24, category: 'Bières',
    });
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Castel 65cl', 'Unité de base': 'bouteille', "Prix d'achat (FCFA)": '700' }),
    ], { update: true });
    expect(report.updated).toBe(1);
    const [after] = await db.select().from(products).where(eq(products.name, 'Castel 65cl'));
    expect(after.purchasePrice).toBe(700);
    expect(after.packName).toBeNull();        // effacé (cellule vide)
    expect(after.alertThreshold).toBeNull();  // effacé
    expect(after.category).toBe('');          // effacé
  });
  it('doublon interne au fichier : la dernière ligne fait foi, comptée dans duplicates', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Riz', 'Unité de base': 'kg', "Prix d'achat (FCFA)": '500' }),
      row(3, { 'Nom': 'riz', 'Unité de base': 'kg', "Prix d'achat (FCFA)": '550' }),
    ], { update: false });
    expect(report.created).toBe(1);
    expect(report.duplicates).toBe(1);
    const [riz] = await db.select().from(products).where(eq(products.name, 'riz'));
    expect(riz.purchasePrice).toBe(550);
  });
  it('conditionnement incomplet rejeté (règle saveProduct)', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Sucre', 'Unité de base': 'kg', 'Conditionnement': 'sac', "Prix d'achat (FCFA)": '400' }),
    ], { update: false });
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].reason).toContain('Conditionnement');
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter :**

```ts
// src/lib/import-products.ts
import { products } from '@/db/schema';
import { saveProduct } from './products';
import { normalizeText } from './text';
import { toNumber, type ParsedRow } from './import-table';
import type { AnyDb } from '@/db';

export interface ImportReport {
  created: number; updated: number; ignored: number; duplicates: number;
  rejects: Array<{ line: number; reason: string }>;
}

// Import en masse des produits. Correspondance des existants par nom normalisé.
// update=false : existant -> ignoré. update=true : la ligne fait foi (les
// optionnels vides EFFACENT le champ). Chaque ligne est indépendante (pas de
// transaction globale — convention v1 neon-http). Spec §8.
export async function importProducts(
  db: AnyDb, rows: ParsedRow[], opts: { update: boolean },
): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, ignored: 0, duplicates: 0, rejects: [] };

  // Doublons internes : la dernière occurrence (par nom normalisé) fait foi.
  const byName = new Map<string, ParsedRow>();
  for (const r of rows) {
    const key = normalizeText(r.cells['Nom'] ?? '');
    if (!key) { report.rejects.push({ line: r.line, reason: 'Nom manquant' }); continue; }
    if (byName.has(key)) report.duplicates++;
    byName.set(key, r);
  }

  const existing: Array<{ id: number; name: string }> = await db.select({
    id: products.id, name: products.name,
  }).from(products);
  const existingByName = new Map(existing.map((p) => [normalizeText(p.name), p.id]));

  for (const [key, r] of byName) {
    const c = r.cells;
    const price = toNumber(c["Prix d'achat (FCFA)"] ?? '');
    if (price == null) {
      report.rejects.push({ line: r.line, reason: "Prix d'achat manquant ou non numérique" });
      continue;
    }
    const packSizeRaw = (c['Taille conditionnement'] ?? '').trim();
    const packSize = packSizeRaw ? toNumber(packSizeRaw) : null;
    if (packSizeRaw && packSize == null) {
      report.rejects.push({ line: r.line, reason: 'Taille de conditionnement non numérique' });
      continue;
    }
    const thresholdRaw = (c["Seuil d'alerte"] ?? '').trim();
    const alertThreshold = thresholdRaw ? toNumber(thresholdRaw) : null;
    if (thresholdRaw && alertThreshold == null) {
      report.rejects.push({ line: r.line, reason: "Seuil d'alerte non numérique" });
      continue;
    }
    const existingId = existingByName.get(key);
    if (existingId && !opts.update) { report.ignored++; continue; }

    const res = await saveProduct(db, {
      id: existingId, // undefined -> création
      name: c['Nom'],
      category: c['Catégorie'] ?? '',
      baseUnit: c['Unité de base'] ?? '',
      packName: (c['Conditionnement'] ?? '').trim() || null,
      packSize,
      purchasePrice: price,
      alertThreshold,
    });
    if (!res.ok) {
      report.rejects.push({ line: r.line, reason: res.error ?? 'Ligne invalide' });
    } else if (existingId) {
      report.updated++;
    } else {
      report.created++;
      if (res.id) existingByName.set(key, res.id); // cohérence si relecture
    }
  }
  return report;
}
```

- [ ] **Step 4:** `npm test` → verts (107 + 4 = 111). **Step 5: Commit** — `"feat(imports): import en masse des produits (TDD)"`

### Task 6: importArticles (TDD)

**Files:**
- Create: `src/lib/import-articles.ts`
- Test: `tests/integration/import-articles.test.ts`

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/integration/import-articles.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { saveSaleArticle, getRecipeMap } from '@/lib/sale-articles';
import { importArticles } from '@/lib/import-articles';
import { saleArticles } from '@/db/schema';
import { eq } from 'drizzle-orm';

const row = (line: number, article: string, emplacement: string, produit: string, qty: string) => ({
  line, cells: { 'Article caisse': article, 'Emplacement': emplacement, 'Produit': produit, 'Quantité': qty },
});

describe('importArticles', () => {
  it('groupe les lignes par article, crée avec la fiche complète, rejette le groupe si un produit manque (avec suggestion)', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const poulet = await saveProduct(db, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 });
    await saveProduct(db, { name: 'Plantain', baseUnit: 'kg', purchasePrice: 800 });
    const report = await importArticles(db, [
      row(2, 'Poulet DG', 'Cuisine', 'Poulet', '0,4'),
      row(3, 'Poulet DG', 'Cuisine', 'Plantain', '0,2'),
      row(4, 'Mojito', 'Bar', 'Rhum', '0,05'), // Rhum inexistant
    ], { update: false });
    expect(report.created).toBe(1);
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].line).toBe(4);
    expect(report.rejects[0].reason).toContain('Rhum');
    const map = await getRecipeMap(db);
    const [dg] = await db.select().from(saleArticles).where(eq(saleArticles.cashName, 'Poulet DG'));
    expect(map.get(dg.id)).toEqual([
      { productId: poulet.id, qty: 0.4 },
      { productId: expect.any(Number), qty: 0.2 },
    ]);
  });
  it('suggestion pour produit proche ; emplacement invalide rejeté', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, { name: 'Plantain', baseUnit: 'kg', purchasePrice: 800 });
    const report = await importArticles(db, [
      row(2, 'Frites', 'Cuisine', 'Plantin', '0,3'),   // faute -> suggestion Plantain
      row(3, 'Test', 'Magasin', 'Plantain', '1'),       // emplacement invalide
    ], { update: false });
    expect(report.rejects).toHaveLength(2);
    expect(report.rejects[0].reason).toContain('Plantain'); // « vouliez-vous … »
    expect(report.rejects[1].reason.toLowerCase()).toContain('emplacement');
  });
  it('existant : ignoré sans update, fiche remplacée avec update ; doublon produit dans un groupe additionné', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const rows = [
      row(2, 'castel 65CL', 'Bar', 'Castel', '1'),
      row(3, 'castel 65CL', 'Bar', 'Castel', '1'), // doublon -> s'additionne (qty 2)
    ];
    const r1 = await importArticles(db, rows, { update: false });
    expect(r1.ignored).toBe(1);
    const r2 = await importArticles(db, rows, { update: true });
    expect(r2.updated).toBe(1);
    const map = await getRecipeMap(db);
    const [art] = await db.select().from(saleArticles).where(eq(saleArticles.cashName, 'Castel 65cl'));
    expect(map.get(art.id)).toEqual([{ productId: castel.id, qty: 2 }]);
  });
  it('quantité invalide rejette le groupe avec la ligne fautive', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 });
    const report = await importArticles(db, [
      row(2, 'Poulet DG', 'Cuisine', 'Poulet', 'beaucoup'),
    ], { update: false });
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].line).toBe(2);
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implémenter :**

```ts
// src/lib/import-articles.ts
import { eq, ne } from 'drizzle-orm';
import { locations, products, saleArticles } from '@/db/schema';
import { saveSaleArticle } from './sale-articles';
import { normalizeText, suggestClosest } from './text';
import { toNumber, type ParsedRow } from './import-table';
import { round3 } from './units';
import type { ImportReport } from './import-products';
import type { AnyDb } from '@/db';

interface Group {
  firstLine: number;
  cashName: string;      // orthographe de la première occurrence
  locationRaw: string;
  lines: Array<{ line: number; productRaw: string; qtyRaw: string }>;
}

// Import en masse des articles (une ligne par ingrédient, groupées par
// (article, emplacement) normalisés). Un produit inconnu, un emplacement
// invalide ou une quantité non numérique rejettent le GROUPE entier. Les
// doublons de produit dans un groupe s'additionnent. update=true remplace
// intégralement la fiche existante. Spec §8.
export async function importArticles(
  db: AnyDb, rows: ParsedRow[], opts: { update: boolean },
): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, ignored: 0, duplicates: 0, rejects: [] };

  const groups = new Map<string, Group>();
  for (const r of rows) {
    const article = (r.cells['Article caisse'] ?? '').trim();
    const emplacement = (r.cells['Emplacement'] ?? '').trim();
    if (!article) { report.rejects.push({ line: r.line, reason: 'Article caisse manquant' }); continue; }
    const key = `${normalizeText(article)}|${normalizeText(emplacement)}`;
    if (!groups.has(key)) {
      groups.set(key, { firstLine: r.line, cashName: article, locationRaw: emplacement, lines: [] });
    }
    groups.get(key)!.lines.push({
      line: r.line, productRaw: (r.cells['Produit'] ?? '').trim(), qtyRaw: r.cells['Quantité'] ?? '',
    });
  }

  const locs: Array<{ id: number; name: string }> = await db.select({
    id: locations.id, name: locations.name,
  }).from(locations).where(ne(locations.type, 'magasin'));
  const locByName = new Map(locs.map((l) => [normalizeText(l.name), l.id]));

  const prods: Array<{ id: number; name: string }> = await db.select({
    id: products.id, name: products.name,
  }).from(products);
  const prodByName = new Map(prods.map((p) => [normalizeText(p.name), p]));
  const prodNames = prods.map((p) => p.name);

  const arts: Array<{ id: number; cashName: string }> = await db.select({
    id: saleArticles.id, cashName: saleArticles.cashName,
  }).from(saleArticles);
  const artByName = new Map(arts.map((a) => [normalizeText(a.cashName), a.id]));

  for (const g of groups.values()) {
    const locationId = locByName.get(normalizeText(g.locationRaw));
    if (!locationId) {
      report.rejects.push({ line: g.firstLine, reason: `Emplacement invalide : « ${g.locationRaw} » (attendu : Bar ou Cuisine)` });
      continue;
    }
    // Fiche : produits + quantités, doublons additionnés.
    const byProduct = new Map<number, number>();
    let rejected = false;
    for (const l of g.lines) {
      const prod = prodByName.get(normalizeText(l.productRaw));
      if (!prod) {
        const suggestion = suggestClosest(l.productRaw, prodNames);
        report.rejects.push({
          line: l.line,
          reason: `Produit « ${l.productRaw} » introuvable${suggestion ? ` — vouliez-vous « ${suggestion} » ?` : ''}`,
        });
        rejected = true; break;
      }
      const qty = toNumber(l.qtyRaw);
      if (qty == null || qty <= 0) {
        report.rejects.push({ line: l.line, reason: `Quantité invalide : « ${l.qtyRaw} »` });
        rejected = true; break;
      }
      byProduct.set(prod.id, round3((byProduct.get(prod.id) ?? 0) + qty));
    }
    if (rejected) continue;

    const existingId = artByName.get(normalizeText(g.cashName));
    if (existingId && !opts.update) { report.ignored++; continue; }

    const res = await saveSaleArticle(db, {
      id: existingId,
      cashName: g.cashName,
      locationId,
      lines: [...byProduct.entries()].map(([productId, qty]) => ({ productId, qty })),
    });
    if (!res.ok) {
      report.rejects.push({ line: g.firstLine, reason: res.error ?? 'Groupe invalide' });
    } else if (existingId) {
      report.updated++;
    } else {
      report.created++;
      if (res.id) artByName.set(normalizeText(g.cashName), res.id);
    }
  }
  return report;
}
```

- [ ] **Step 4:** `npm test` → verts (111 + 4 = 115). **Step 5: Commit** — `"feat(imports): import en masse des articles avec suggestions (TDD)"`

### Task 7: Page /admin/imports + actions + nav

**Files:**
- Create: `src/app/(protected)/admin/imports/page.tsx`, `actions.ts`, `import-form.tsx`
- Modify: `src/components/ui/bottom-nav.tsx` (icône), `src/app/(protected)/layout.tsx` (entrée nav)

- [ ] **Step 1: actions.ts**

```ts
// src/app/(protected)/admin/imports/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { parseTable } from '@/lib/import-table';
import { PRODUCT_HEADERS, ARTICLE_HEADERS } from '@/lib/templates';
import { importProducts, type ImportReport } from '@/lib/import-products';
import { importArticles } from '@/lib/import-articles';

export type ImportFormState = { error?: string; report?: ImportReport };

async function runImport(
  formData: FormData,
  headers: readonly string[],
  run: (rows: Parameters<typeof importProducts>[1], update: boolean) => Promise<ImportReport>,
  paths: string[],
): Promise<ImportFormState> {
  await requireRole(['admin']);
  const file = formData.get('file') as File | null;
  if (!file || !file.size) return { error: 'Choisissez un fichier CSV ou Excel' };
  const update = formData.get('update') === 'on';
  const parsed = parseTable(Buffer.from(await file.arrayBuffer()), file.name, [...headers]);
  if (!parsed.ok) return { error: parsed.error };
  try {
    const report = await run(parsed.rows, update);
    for (const p of paths) revalidatePath(p);
    return { report };
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
}

export async function importProductsAction(_prev: ImportFormState, formData: FormData) {
  return runImport(formData, PRODUCT_HEADERS,
    (rows, update) => importProducts(db, rows, { update }),
    ['/admin/imports', '/admin/produits']);
}

export async function importArticlesAction(_prev: ImportFormState, formData: FormData) {
  return runImport(formData, ARTICLE_HEADERS,
    (rows, update) => importArticles(db, rows, { update }),
    ['/admin/imports', '/admin/articles']);
}
```

- [ ] **Step 2: import-form.tsx (client, paramétré, réutilisé ×2)**

```tsx
// src/app/(protected)/admin/imports/import-form.tsx
'use client';
import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import type { ImportFormState } from './actions';

export function ImportForm({ action, submitLabel }: {
  action: (prev: ImportFormState, formData: FormData) => Promise<ImportFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.report) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="space-y-3 text-sm">
      <input name="file" type="file" accept=".csv,.xlsx,.xls" required
        className="block w-full text-muted file:mr-3 file:rounded-[10px] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-cream" />
      <label className="flex items-center gap-2 text-muted">
        <input type="checkbox" name="update" className="size-4 accent-[#c8102e]" />
        Mettre à jour les existants
      </label>
      <FormError message={state.error} />
      {state.report && (
        <div className="bg-card border border-line rounded-xl p-3 space-y-1">
          <p className="text-success font-semibold">
            {state.report.created} créé(s) · {state.report.updated} mis à jour · {state.report.ignored} ignoré(s)
            {state.report.duplicates > 0 && ` · ${state.report.duplicates} doublon(s) de fichier`}
            {' · '}{state.report.rejects.length} rejeté(s)
          </p>
          {state.report.rejects.map((r, i) => (
            <p key={i} className="text-negative text-xs">ligne {r.line} : {r.reason}</p>
          ))}
        </div>
      )}
      <Button type="submit" pending={pending} className="w-full">{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 3: page.tsx**

```tsx
// src/app/(protected)/admin/imports/page.tsx
import { requireRole } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { ImportForm } from './import-form';
import { importProductsAction, importArticlesAction } from './actions';

export const dynamic = 'force-dynamic';

function TemplateLinks({ type }: { type: 'produits' | 'articles' }) {
  const base = `/admin/imports/template?type=${type}`;
  return (
    <p className="text-sm text-muted">
      Template :{' '}
      <a href={`${base}&format=xlsx`} className="text-action underline underline-offset-4">Excel (.xlsx)</a>
      {' · '}
      <a href={`${base}&format=csv`} className="text-action underline underline-offset-4">CSV</a>
    </p>
  );
}

export default async function ImportsAdminPage() {
  await requireRole(['admin']);
  return (
    <div className="space-y-4">
      <PageHeader title="Imports"
        subtitle="Téléchargez un template, remplissez-le, puis chargez-le. L'import ne lit que la première feuille." />
      <Card className="p-4 space-y-3">
        <h2 className="font-display text-lg font-bold text-cream">Produits</h2>
        <TemplateLinks type="produits" />
        <ImportForm action={importProductsAction} submitLabel="Importer les produits" />
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-display text-lg font-bold text-cream">Articles & fiches techniques</h2>
        <p className="text-sm text-muted">Une ligne par ingrédient — les produits référencés doivent déjà exister.</p>
        <TemplateLinks type="articles" />
        <ImportForm action={importArticlesAction} submitLabel="Importer les articles" />
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: nav** — dans `src/components/ui/bottom-nav.tsx`, ajouter `FileUp` à l'import lucide et `fichiers: FileUp` au map ICONS. Dans `src/app/(protected)/layout.tsx`, ajouter à `NAV.admin` : `{ href: '/admin/imports', label: 'Imports', icon: 'fichiers' }` (5ᵉ position).

- [ ] **Step 5:** `npm test` (115), `npx tsc --noEmit`, `npm run lint`, `npm run build` (routes /admin/imports + template). Vérif manuelle : télécharger les 4 templates (2 types × 2 formats) via curl avec un cookie admin OU vérifier build seulement si pas de session locale.
- [ ] **Step 6: Commit** — `"feat(admin): page Imports (templates + upload produits/articles)"`

### Task 8: Édition des produits (UI)

**Files:**
- Modify: `src/app/(protected)/admin/produits/page.tsx`, `product-form.tsx`, `product-list.tsx`, `actions.ts`

- [ ] **Step 1: page.tsx** — lire `searchParams` (`{ edit?: string }`, Promise en Next 16 : `const { edit } = await searchParams;`). Si `edit` numérique fini : charger le produit (`db.select().from(products).where(eq(products.id, Number(edit)))`) ; introuvable → ignorer (mode création). Passer au formulaire :

```tsx
<ProductForm key={editing?.id ?? 'new'} initial={editing ? {
  id: editing.id, name: editing.name, category: editing.category,
  baseUnit: editing.baseUnit, packName: editing.packName,
  packSize: editing.packSize ? Number(editing.packSize) : null,
  purchasePrice: editing.purchasePrice,
  alertThreshold: editing.alertThreshold ? Number(editing.alertThreshold) : null,
  active: editing.active,
} : undefined} />
```

(le `key` force le remontage quand on change de cible d'édition)

- [ ] **Step 2: product-form.tsx** — prop `initial?: {...}` (même shape que ci-dessus). Champ caché `id` si `initial`. `defaultValue={initial?.name}` etc. sur chaque champ. NOUVEAU : case « Produit actif » `<label className="flex items-center gap-2 text-muted col-span-2"><input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="size-4 accent-[#c8102e]" /> Produit actif</label>`. Bouton : `{initial ? 'Mettre à jour' : 'Enregistrer'}` type="submit". Si `initial`, lien Annuler : `<a href="/admin/produits" className="text-muted underline text-center col-span-2 text-xs">Annuler</a>`.
- [ ] **Step 3: actions.ts** — `saveProductAction` : le champ `active` vient d'une checkbox → `active: formData.get('active') === 'on'`. ATTENTION : l'action actuelle a `active: formData.get('active') !== 'off'` (toujours true si champ absent) — en création la checkbox est cochée par défaut donc `'on'`; ce changement est SÛR car le formulaire envoie désormais toujours la checkbox. En succès d'un update (id présent) : `redirect('/admin/produits')` HORS try/catch (retire ?edit de l'URL).
- [ ] **Step 4: product-list.tsx** — ajouter sur chaque ListRow un lien « Modifier » : `<a href={`/admin/produits?edit=${p.id}`} className="text-action text-xs underline underline-offset-4 shrink-0">Modifier</a>` (le composant est client : utiliser `<a>` ou `next/link`, les deux passent — Link préféré).
- [ ] **Step 5:** tests (115) + tsc + lint + build. **Step 6: Commit** — `"feat(admin): édition des produits (pré-remplissage + case actif)"`

### Task 9: Édition des articles (UI)

**Files:**
- Modify: `src/app/(protected)/admin/articles/page.tsx`, `article-form.tsx`, `actions.ts`

- [ ] **Step 1: page.tsx** — même mécanique `?edit=<id>` : charger l'article + SES lignes (`recipeLines` jointes à `products` non nécessaire — productId + qty suffisent). Passer :

```tsx
<ArticleForm key={editing?.id ?? 'new'} products={...} locations={...} initial={editing ? {
  id: editing.id, cashName: editing.cashName, locationId: editing.locationId,
  lines: editingLines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })),
} : undefined} />
```

Ajouter le lien « Modifier » sur chaque article de la liste (comme Task 8 Step 4).

- [ ] **Step 2: article-form.tsx** — prop `initial?`. `useState(initial?.lines.length || 1)` pour lineCount. Champ caché `id`. `defaultValue` sur cashName/locationId ; pour chaque ligne i : `defaultValue={initial?.lines[i]?.productId ?? ''}` sur le Select et `defaultValue={initial?.lines[i]?.qty ?? ''}` sur l'Input. En mode édition, texte d'aide (spec §4) : `<p className="text-xs text-warning">Attention : le nom caisse doit correspondre exactement à l'export du logiciel de caisse, sinon les prochains imports de ventes ne matcheront plus.</p>`. Bouton `{initial ? "Mettre à jour l'article" : "Enregistrer l'article"}` type="submit" + lien Annuler.
- [ ] **Step 3: actions.ts** — `saveSaleArticleAction` lit déjà `formData.get('id')` (vérifier : oui, le code d'origine le fait). En succès d'update : `redirect('/admin/articles')` hors try/catch.
- [ ] **Step 4:** tests + tsc + lint + build. **Step 5: Commit** — `"feat(admin): édition des articles et fiches techniques"`

### Task 10: Édition des utilisateurs (UI)

**Files:**
- Modify: `src/app/(protected)/admin/utilisateurs/page.tsx`, `user-form.tsx`, `actions.ts`

- [ ] **Step 1: actions.ts** — nouvelle action :

```ts
export async function updateUserAction(_prev: UserFormState, formData: FormData) {
  await requireRole(['admin']);
  const id = formNumber(formData, 'id');
  if (id == null) return { error: 'Utilisateur invalide' };
  let res: Awaited<ReturnType<typeof updateUser>>;
  try {
    res = await updateUser(db, {
      id,
      name: String(formData.get('name') ?? ''),
      role: String(formData.get('role')) as Role,
      password: String(formData.get('password') ?? '') || undefined,
    });
  } catch {
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/utilisateurs');
  redirect('/admin/utilisateurs'); // hors try/catch
}
```

- [ ] **Step 2: page.tsx** — `?edit=<id>` : charger l'utilisateur, passer `initial={{ id, name, username, role }}` à UserForm (key comme Task 8). Lien « Modifier » par ligne (à côté du bouton Désactiver).
- [ ] **Step 3: user-form.tsx** — prop `initial?`. En mode édition : action = `updateUserAction`, username affiché en lecture seule (`<p className="text-muted text-sm self-center">@{initial.username}</p>` à la place de l'input username), champ mot de passe `placeholder="Nouveau mot de passe (laisser vide pour conserver)"` NON required, rôle `defaultValue={initial.role}`, bouton « Mettre à jour » type="submit", lien Annuler. En création : comportement actuel inchangé (mot de passe required).
- [ ] **Step 4:** tests + tsc + lint + build. **Step 5: Commit** — `"feat(admin): édition des comptes (nom, rôle, mot de passe optionnel)"`

### Task 11: Balayage final

- [ ] **Step 1:** `npm test` → **115/22 attendus** (93 + 5 updateUser + 2 suggest + 5 import-table + 2 templates + 4 import-products + 4 import-articles). `npx tsc --noEmit`, `npm run lint`, `npm run build` propres.
- [ ] **Step 2:** Vérifs ciblées : `grep -rn 'type="submit"' src/app/\(protected\)/admin/imports src/app/\(protected\)/admin/produits src/app/\(protected\)/admin/articles src/app/\(protected\)/admin/utilisateurs` → chaque formulaire a exactement son submit. `grep -rn "state.error && <p" src/app` → vide.
- [ ] **Step 3:** README : ajouter une ligne dans la section admin mentionnant `/admin/imports` (templates + import en masse).
- [ ] **Step 4: Commit** — `"docs: README — page Imports admin"`

---

## Auto-révision du plan

**Couverture spec :** édition produits §3 (T8), articles §4 (T9), utilisateurs §5 (T1+T10, garde dernier admin T1), page imports §6 (T7), templates §7 (T4), règles d'import §8 (T3 en-têtes/T5 produits/T6 articles — correspondance normalisée, cellule vide efface, groupes rejetés, doublons, indépendance), erreurs §9 (suggestions T2+T6, conventions actions T7/T10), architecture §10 (fichiers conformes), tests §11 (TDD partout, 93 existants intacts). Rien d'orphelin.

**Points d'attention exécutant :**
- Le compte de tests attendu par étape est indicatif (93→98→100→105→107→111→115) ; l'invariant dur est : AUCUN test existant modifié.
- T5/T6 : `ImportReport` est défini dans import-products.ts et importé par import-articles.ts — ne pas dupliquer.
- T8 Step 3 : le changement `active !== 'off'` → `active === 'on'` est intentionnel et sûr (checkbox désormais toujours présente) — le noter dans le commit.
- Next 16 : `searchParams` est une Promise (`await searchParams`) — même pattern que compta/rapprochements/page.tsx.
- Le CSV template embarque un BOM `﻿` — le caractère est invisible dans le code (chaîne `'﻿'`) ; vérifier au test qu'il est bien présent.

