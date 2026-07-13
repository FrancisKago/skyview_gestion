// Contrat des actions opérationnelles avec useActionState : en cas d'erreur,
// l'action renvoie les valeurs soumises (`values`) et incrémente `attempt` pour
// que le client remonte les champs avec la saisie préservée (React 19
// réinitialise les champs non contrôlés après chaque soumission). Même contrat
// que tests/unit/admin-form-actions.test.ts pour les actions admin.
// Les dépendances Next/DB sont mockées : on ne teste ici que le contrat d'état.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revalidatePath } from 'next/cache';
import { recordAdjustment } from '@/lib/adjustments';
import { createOrder, receiveOrder, deliverOrder } from '@/lib/orders';
import { recordServiceExit } from '@/lib/service-exits';
import { validateInventory } from '@/lib/inventories';
import { recordAdjustmentAction } from '@/app/(protected)/admin/ajustements/actions';
import { createOrderAction } from '@/app/(protected)/commandes/actions';
import { recordExitAction } from '@/app/(protected)/sorties/actions';
import { validateInventoryAction } from '@/app/(protected)/inventaire/actions';
import { receiveOrderAction } from '@/app/(protected)/receptions/actions';
import { deliverOrderAction } from '@/app/(protected)/livraisons/actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// redirect() lève une exception dans Next : le mock reproduit ce contrat.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }),
}));
vi.mock('@/lib/session', () => ({
  requireRole: vi.fn(async () => ({ userId: 1, role: 'barman', locationId: 2 })),
}));
vi.mock('@/lib/adjustments', () => ({ recordAdjustment: vi.fn() }));
vi.mock('@/lib/orders', () => ({
  createOrder: vi.fn(), receiveOrder: vi.fn(), deliverOrder: vi.fn(),
}));
vi.mock('@/lib/service-exits', () => ({ recordServiceExit: vi.fn() }));
vi.mock('@/lib/inventories', () => ({ validateInventory: vi.fn() }));
// deliverOrderAction lit packSize directement en base (db.select) : chaîne
// select().from().where() minimale ; les autres actions passent `db` aux
// fonctions lib mockées sans l'utiliser.
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ id: 5, packSize: '12' }]),
      })),
    })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordAdjustmentAction', () => {
  const adjustmentData = () => {
    const fd = new FormData();
    fd.set('productId', '5');
    fd.set('locationId', '2');
    fd.set('qty', '-3');
    fd.set('reason', 'Casse');
    return fd;
  };

  it('erreur de validation : renvoie error + values soumises + attempt incrémenté', async () => {
    const fd = adjustmentData();
    fd.set('productId', ''); // aucun produit choisi
    const state = await recordAdjustmentAction({}, fd);
    expect(state.error).toBe('Choisissez un produit');
    expect(state.values).toEqual({ productId: '', locationId: '2', qty: '-3', reason: 'Casse' });
    expect(state.attempt).toBe(1);
    expect(recordAdjustment).not.toHaveBeenCalled();
  });

  it('erreur métier : values préservées, attempt continue de croître', async () => {
    vi.mocked(recordAdjustment).mockResolvedValue({ ok: false, error: 'X' });
    const first = await recordAdjustmentAction({}, adjustmentData());
    const second = await recordAdjustmentAction(first, adjustmentData());
    expect(second.values?.reason).toBe('Casse');
    expect(second.attempt).toBe(2);
  });

  it('succès : { success: true } sans values ni attempt (reset manuel conservé)', async () => {
    vi.mocked(recordAdjustment).mockResolvedValue({ ok: true });
    const state = await recordAdjustmentAction({}, adjustmentData());
    expect(state).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/ajustements');
  });
});

describe('createOrderAction', () => {
  const orderData = () => {
    const fd = new FormData();
    fd.append('lineProduct', '5');
    fd.append('lineQty', '12');
    fd.append('lineProduct', '7');
    fd.append('lineQty', ''); // ligne incomplète → erreur de validation
    return fd;
  };

  it('ligne incomplète : erreur + toutes les lignes renvoyées à leur position', async () => {
    const state = await createOrderAction({}, orderData());
    expect(state.error).toBe('Ligne incomplète : chaque ligne doit avoir un produit ET une quantité');
    expect(state.values).toEqual({
      lines: [
        { productId: '5', qty: '12' },
        { productId: '7', qty: '' },
      ],
    });
    expect(state.attempt).toBe(1);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('succès : { success: true } sans values ni attempt (reset manuel conservé)', async () => {
    vi.mocked(createOrder).mockResolvedValue({ ok: true, id: 9 });
    const fd = orderData();
    fd.delete('lineProduct');
    fd.delete('lineQty');
    fd.append('lineProduct', '5');
    fd.append('lineQty', '12');
    const state = await createOrderAction({}, fd);
    expect(state).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith('/commandes');
  });
});

describe('recordExitAction', () => {
  const exitData = () => {
    const fd = new FormData();
    fd.set('serviceDate', '2026-07-12');
    fd.set('clientToken', 'jeton-1');
    fd.append('lineProduct', '5');
    fd.append('lineQty', '4');
    return fd;
  };

  it('erreur métier : renvoie error + date et lignes soumises + attempt', async () => {
    vi.mocked(recordServiceExit).mockResolvedValue({ ok: false, error: 'Sorties déjà validées pour ce service' });
    const state = await recordExitAction({}, exitData());
    expect(state.error).toBe('Sorties déjà validées pour ce service');
    expect(state.values).toEqual({
      serviceDate: '2026-07-12',
      lines: [{ productId: '5', qty: '4' }],
    });
    expect(state.attempt).toBe(1);
  });

  it('succès : success + warnings, sans values ni attempt', async () => {
    vi.mocked(recordServiceExit).mockResolvedValue({ ok: true, warnings: ['Stock négatif : Castel'] });
    const state = await recordExitAction({}, exitData());
    expect(state).toEqual({ success: true, warnings: ['Stock négatif : Castel'] });
    expect(revalidatePath).toHaveBeenCalledWith('/sorties');
  });
});

describe('validateInventoryAction', () => {
  const inventoryData = () => {
    const fd = new FormData();
    fd.set('inventoryDate', '2026-07-12');
    fd.append('lineProduct', '5');
    fd.append('lineCounted', '10');
    fd.append('lineProduct', '7');
    fd.append('lineCounted', ''); // non compté : ignoré, pas une erreur
    return fd;
  };

  it('erreur métier : renvoie date + quantités comptées indexées par produit', async () => {
    vi.mocked(validateInventory).mockResolvedValue({ ok: false, error: 'Date invalide' });
    const state = await validateInventoryAction({}, inventoryData());
    expect(state.error).toBe('Date invalide');
    // Le produit 7 (non compté) est omis : son champ remontera vide.
    expect(state.values).toEqual({
      inventoryDate: '2026-07-12',
      counted: { '5': '10' },
    });
    expect(state.attempt).toBe(1);
  });

  it('quantité forgée non numérique : erreur + saisie préservée', async () => {
    const fd = inventoryData();
    fd.delete('lineCounted');
    fd.append('lineCounted', 'abc');
    fd.append('lineCounted', '3');
    const state = await validateInventoryAction({}, fd);
    expect(state.error).toBe('Quantité comptée invalide');
    expect(state.values?.counted).toEqual({ '5': 'abc', '7': '3' });
    expect(validateInventory).not.toHaveBeenCalled();
  });

  it('succès : renvoie les écarts, sans values ni attempt', async () => {
    vi.mocked(validateInventory).mockResolvedValue({ ok: true, gaps: [] });
    const state = await validateInventoryAction({}, inventoryData());
    expect(state).toEqual({ gaps: [] });
    expect(revalidatePath).toHaveBeenCalledWith('/inventaire');
  });
});

describe('receiveOrderAction', () => {
  const receptionData = () => {
    const fd = new FormData();
    fd.set('orderId', '9');
    fd.append('lineProduct', '5');
    fd.append('lineQty', '11');
    fd.append('lineProduct', '7');
    fd.append('lineQty', '2');
    return fd;
  };

  it('quantité manquante : erreur + quantités indexées par produit + attempt', async () => {
    const fd = receptionData();
    fd.delete('lineQty');
    fd.append('lineQty', '11');
    fd.append('lineQty', ''); // champ vidé par l'utilisateur
    const state = await receiveOrderAction({}, fd);
    expect(state.error).toBe('Quantité reçue invalide sur une ligne');
    expect(state.values).toEqual({ qty: { '5': '11', '7': '' } });
    expect(state.attempt).toBe(1);
    expect(receiveOrder).not.toHaveBeenCalled();
  });

  it('erreur métier : values préservées', async () => {
    vi.mocked(receiveOrder).mockResolvedValue({ ok: false, error: 'Commande introuvable' });
    const state = await receiveOrderAction({}, receptionData());
    expect(state.error).toBe('Commande introuvable');
    expect(state.values).toEqual({ qty: { '5': '11', '7': '2' } });
  });

  it('succès : redirection vers /stock', async () => {
    vi.mocked(receiveOrder).mockResolvedValue({ ok: true });
    await expect(receiveOrderAction({}, receptionData())).rejects.toThrow('NEXT_REDIRECT');
    expect(revalidatePath).toHaveBeenCalledWith('/receptions');
    expect(revalidatePath).toHaveBeenCalledWith('/stock');
  });
});

describe('deliverOrderAction', () => {
  const deliveryData = () => {
    const fd = new FormData();
    fd.set('orderId', '9');
    fd.append('lineProduct', '5');
    fd.append('linePacks', '1');
    fd.append('lineUnits', '2');
    return fd;
  };

  it('erreur métier : renvoie casiers et unités indexés par produit + attempt', async () => {
    vi.mocked(deliverOrder).mockResolvedValue({ ok: false, error: 'Commande introuvable' });
    const state = await deliverOrderAction({}, deliveryData());
    expect(state.error).toBe('Commande introuvable');
    expect(state.values).toEqual({ lines: { '5': { packs: '1', units: '2' } } });
    expect(state.attempt).toBe(1);
  });

  it('quantité manquante : erreur + saisie préservée, deliverOrder non appelé', async () => {
    const fd = deliveryData();
    fd.delete('lineUnits');
    fd.append('lineUnits', '');
    const state = await deliverOrderAction({}, fd);
    expect(state.error).toBe('Quantité livrée invalide sur une ligne');
    expect(state.values).toEqual({ lines: { '5': { packs: '1', units: '' } } });
    expect(deliverOrder).not.toHaveBeenCalled();
  });

  it('succès : conversion casiers → unités de base puis redirection', async () => {
    vi.mocked(deliverOrder).mockResolvedValue({ ok: true });
    await expect(deliverOrderAction({}, deliveryData())).rejects.toThrow('NEXT_REDIRECT');
    // 1 casier de 12 + 2 unités = 14 (packSize lu en base via le mock db).
    expect(deliverOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      orderId: 9,
      lines: [{ productId: 5, qtyDelivered: 14 }],
    }));
    expect(revalidatePath).toHaveBeenCalledWith('/livraisons');
  });
});
