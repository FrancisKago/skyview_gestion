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
