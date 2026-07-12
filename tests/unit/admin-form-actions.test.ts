// Contrat des actions admin avec useActionState : en cas d'erreur, l'action
// renvoie les valeurs soumises (`values`) et incrémente `attempt` pour que le
// client remonte les champs avec la saisie préservée (React 19 réinitialise
// les champs non contrôlés après chaque soumission). Après succès, l'état est
// vide : le reset automatique (souhaité en création) est conservé.
// Les dépendances Next/DB sont mockées : on ne teste ici que le contrat d'état.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revalidatePath } from 'next/cache';
import { saveProduct } from '@/lib/products';
import { createUser, updateUser } from '@/lib/users';
import { saveSaleArticle } from '@/lib/sale-articles';
import { saveProductAction } from '@/app/(protected)/admin/produits/actions';
import { createUserAction, updateUserAction } from '@/app/(protected)/admin/utilisateurs/actions';
import { saveSaleArticleAction } from '@/app/(protected)/admin/articles/actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// redirect() lève une exception dans Next : le mock reproduit ce contrat.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }),
}));
vi.mock('@/lib/session', () => ({
  requireRole: vi.fn(async () => ({ userId: 1, role: 'admin' })),
}));
vi.mock('@/lib/products', () => ({ saveProduct: vi.fn() }));
vi.mock('@/lib/users', () => ({ createUser: vi.fn(), setUserActive: vi.fn(), updateUser: vi.fn() }));
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
    fd.set('active', 'on');
    return fd;
  };

  it('erreur métier : renvoie error + values soumises + attempt incrémenté', async () => {
    vi.mocked(saveProduct).mockResolvedValue({ ok: false, error: 'Le nom est obligatoire' });
    const state = await saveProductAction({}, productData());
    expect(state.error).toBe('Le nom est obligatoire');
    expect(state.values).toEqual({
      name: 'Castel 65cl', category: 'Bière', baseUnit: 'bouteille',
      packName: 'casier', packSize: '12', purchasePrice: '650', alertThreshold: '24',
      active: 'on',
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

describe('updateUserAction', () => {
  const editData = () => {
    const fd = new FormData();
    fd.set('id', '4');
    fd.set('name', 'Jean Mballa');
    fd.set('role', 'barman');
    fd.set('password', 'nouveaumdp');
    return fd;
  };

  it('erreur métier : renvoie nom et rôle (jamais le mot de passe) + attempt', async () => {
    vi.mocked(updateUser).mockResolvedValue({ ok: false, error: 'Impossible de rétrograder le dernier admin' });
    const state = await updateUserAction({}, editData());
    expect(state.error).toBe('Impossible de rétrograder le dernier admin');
    expect(state.values).toEqual({ name: 'Jean Mballa', role: 'barman' });
    expect(state.attempt).toBe(1);
  });

  it('id forgé : erreur + saisie préservée', async () => {
    const fd = editData();
    fd.set('id', 'abc');
    const state = await updateUserAction({}, fd);
    expect(state.error).toBe('Utilisateur invalide');
    expect(state.values).toEqual({ name: 'Jean Mballa', role: 'barman' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("succès : redirection vers la liste (retire ?edit de l'URL)", async () => {
    vi.mocked(updateUser).mockResolvedValue({ ok: true });
    await expect(updateUserAction({}, editData())).rejects.toThrow('NEXT_REDIRECT');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/utilisateurs');
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
