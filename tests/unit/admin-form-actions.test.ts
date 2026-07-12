// Contrat des actions admin avec useActionState : en cas d'erreur, l'action
// renvoie les valeurs soumises (`values`) et incrémente `attempt` pour que le
// client remonte les champs avec la saisie préservée (React 19 réinitialise
// les champs non contrôlés après chaque soumission). Après succès, l'état est
// vide : le reset automatique (souhaité en création) est conservé.
// Les dépendances Next/DB sont mockées : on ne teste ici que le contrat d'état.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revalidatePath } from 'next/cache';
import { saveProduct } from '@/lib/products';
import { createUser } from '@/lib/users';
import { saveSaleArticle } from '@/lib/sale-articles';
import { saveProductAction } from '@/app/(protected)/admin/produits/actions';
import { createUserAction } from '@/app/(protected)/admin/utilisateurs/actions';
import { saveSaleArticleAction } from '@/app/(protected)/admin/articles/actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({
  requireRole: vi.fn(async () => ({ userId: 1, role: 'admin' })),
}));
vi.mock('@/lib/products', () => ({ saveProduct: vi.fn() }));
vi.mock('@/lib/users', () => ({ createUser: vi.fn(), setUserActive: vi.fn() }));
vi.mock('@/lib/sale-articles', () => ({ saveSaleArticle: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveProductAction', () => {
  const productData = () => {
    const fd = new FormData();
    fd.set('name', 'Castel 65cl');
    fd.set('category', 'Bière');
    fd.set('baseUnit', 'bouteille');
    fd.set('packName', 'casier');
    fd.set('packSize', '12');
    fd.set('purchasePrice', '650');
    fd.set('alertThreshold', '24');
    return fd;
  };

  it('erreur métier : renvoie error + values soumises + attempt incrémenté', async () => {
    vi.mocked(saveProduct).mockResolvedValue({ ok: false, error: 'Le nom est obligatoire' });
    const state = await saveProductAction({}, productData());
    expect(state.error).toBe('Le nom est obligatoire');
    expect(state.values).toEqual({
      name: 'Castel 65cl', category: 'Bière', baseUnit: 'bouteille',
      packName: 'casier', packSize: '12', purchasePrice: '650', alertThreshold: '24',
    });
    expect(state.attempt).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('deux erreurs consécutives : attempt continue de croître (key change à chaque fois)', async () => {
    vi.mocked(saveProduct).mockResolvedValue({ ok: false, error: 'X' });
    const first = await saveProductAction({}, productData());
    const second = await saveProductAction(first, productData());
    expect(second.attempt).toBe(2);
  });

  it('exception DB : message générique + values préservées', async () => {
    vi.mocked(saveProduct).mockRejectedValue(new Error('boom'));
    const state = await saveProductAction({}, productData());
    expect(state.error).toBe('Service indisponible, veuillez réessayer.');
    expect(state.values?.name).toBe('Castel 65cl');
  });

  it('succès : état vide (reset du formulaire conservé en création)', async () => {
    vi.mocked(saveProduct).mockResolvedValue({ ok: true, id: 1 });
    const prev = { error: 'X', values: { name: 'A' }, attempt: 2 };
    const state = await saveProductAction(prev, productData());
    expect(state).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith('/admin/produits');
  });
});

describe('createUserAction', () => {
  const userData = () => {
    const fd = new FormData();
    fd.set('name', 'Jean Mballa');
    fd.set('username', 'jmballa');
    fd.set('password', 'motdepasse');
    fd.set('role', 'barman');
    return fd;
  };

  it('erreur : renvoie les valeurs SAUF le mot de passe', async () => {
    vi.mocked(createUser).mockResolvedValue({ ok: false, error: 'Identifiant déjà pris' });
    const state = await createUserAction({}, userData());
    expect(state.error).toBe('Identifiant déjà pris');
    expect(state.values).toEqual({ name: 'Jean Mballa', username: 'jmballa', role: 'barman' });
    expect(state.attempt).toBe(1);
  });

  it('succès : état vide', async () => {
    vi.mocked(createUser).mockResolvedValue({ ok: true });
    expect(await createUserAction({}, userData())).toEqual({});
  });
});

describe('saveSaleArticleAction', () => {
  const articleData = () => {
    const fd = new FormData();
    fd.set('cashName', 'POULET DG');
    fd.set('locationId', '2');
    fd.append('lineProduct', '5');
    fd.append('lineQty', '1');
    fd.append('lineProduct', '7');
    fd.append('lineQty', ''); // ligne incomplète → erreur de validation
    return fd;
  };

  it('ligne incomplète : erreur + toutes les lignes renvoyées à leur position', async () => {
    const state = await saveSaleArticleAction({}, articleData());
    expect(state.error).toBe('Ligne incomplète : chaque ingrédient doit avoir un produit ET une quantité');
    expect(state.values).toEqual({
      cashName: 'POULET DG',
      locationId: '2',
      lines: [
        { productId: '5', qty: '1' },
        { productId: '7', qty: '' },
      ],
    });
    expect(state.attempt).toBe(1);
    expect(saveSaleArticle).not.toHaveBeenCalled();
  });

  it('succès : état vide', async () => {
    vi.mocked(saveSaleArticle).mockResolvedValue({ ok: true, id: 3 });
    const fd = articleData();
    // On complète la 2e ligne pour rendre la fiche valide :
    fd.delete('lineQty');
    fd.append('lineQty', '1');
    fd.append('lineQty', '0.5');
    expect(await saveSaleArticleAction({}, fd)).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith('/admin/articles');
  });
});
