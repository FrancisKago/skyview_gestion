import { and, eq, inArray } from 'drizzle-orm';
import { inventories, inventoryLines, stockMovements, products } from '@/db/schema';
import { getProductStock } from './stock';
import { round3 } from './units';
import { isValidDateString } from './dates';
import type { AnyDb } from '@/db';

export interface InventoryGap {
  productId: number; name: string;
  qtyTheoretical: number; qtyCounted: number;
  gap: number; gapValue: number; // FCFA (négatif = manquant)
}

export interface ValidateInventoryInput {
  locationId: number; inventoryDate: string; countedBy: number;
  lines: Array<{ productId: number; qtyCounted: number }>;
}

// Compromis assumés v1 (mêmes conventions que src/lib/orders.ts#receiveOrder et
// src/lib/service-exits.ts) :
// - TOCTOU : pas de transaction enveloppant l'ensemble ; acceptable pour un seul
//   barman/cuisinier par emplacement à la fois.
// - Idempotence via le statut de l'inventaire (brouillon -> valide) : la ligne
//   'inventories' est créée en 'brouillon' EN PREMIER (elle obtient un id stable
//   qu'on utilise comme refId), puis on écrit mouvements + lignes de détail, puis
//   on bascule le statut à 'valide' EN DERNIER. Si le processus s'interrompt après
//   la création de l'inventaire mais avant la bascule de statut, un réessai avec
//   les MÊMES lignes ré-utiliserait normalement ce brouillon — mais comme il n'y a
//   pas de moyen de retrouver "le brouillon en cours" depuis l'appelant (contrairement
//   à receiveOrder qui a un orderId stable), chaque appel crée un nouvel inventaire.
//   La garde ci-dessous (vérifier qu'aucun mouvement 'inventory'+refId n'existe déjà)
//   protège uniquement contre un DOUBLE appel sur le MÊME inventaire déjà créé — ce
//   qui ne peut arriver ici que si un appelant futur réutilise un id de brouillon
//   existant. On la garde par cohérence avec receiveOrder/le futur appelant, et parce
//   qu'elle documente l'intention : le statut 'valide' final est le signal de succès.
// - Ordre d'écriture PAR PRODUIT : mouvement de stock (fait foi) AVANT la ligne
//   d'inventaire (détail/affichage), comme service-exits. Un crash en cours de
//   boucle laisse alors un état où le stock déjà ajusté pour les produits traités
//   est correct, quitte à ce que le détail de quelques lignes manque.
export async function validateInventory(db: AnyDb, input: ValidateInventoryInput):
  Promise<{ ok: boolean; gaps?: InventoryGap[]; error?: string }> {
  const rawLines = input.lines.filter((l) => l.productId != null);
  if (!rawLines.length) return { ok: false, error: 'Saisissez au moins un comptage' };
  if (rawLines.some((l) => !Number.isFinite(l.qtyCounted) || l.qtyCounted < 0)) {
    return { ok: false, error: 'Les quantités comptées doivent être positives' };
  }
  if (!isValidDateString(input.inventoryDate)) {
    return { ok: false, error: "Date d'inventaire invalide" };
  }

  // Fusion des doublons : dernière valeur retenue (cf. receiveOrder), pour rester
  // cohérent avec le fait qu'un même produit ne peut avoir qu'une seule ligne
  // d'inventaire (contrainte métier, pas de somme comme pour les sorties de service :
  // un comptage physique n'a pas de sens additionné).
  const byProduct = new Map<number, number>();
  for (const l of rawLines) byProduct.set(l.productId, l.qtyCounted);

  const productIds = [...byProduct.keys()];
  const found = await db.select({ id: products.id, name: products.name, purchasePrice: products.purchasePrice })
    .from(products).where(inArray(products.id, productIds));
  if (found.length !== productIds.length) {
    return { ok: false, error: "Produit inconnu dans l'inventaire" };
  }
  const productById = new Map<number, { id: number; name: string; purchasePrice: number }>(
    found.map((p: { id: number; name: string; purchasePrice: number }) => [p.id, p]),
  );

  // Étape 1 : créer l'inventaire en 'brouillon' d'abord (id stable pour refId).
  const [inv] = await db.insert(inventories).values({
    locationId: input.locationId, inventoryDate: input.inventoryDate,
    countedBy: input.countedBy, status: 'brouillon',
  }).returning();

  // Garde d'idempotence (cf. receiveOrder) : si des mouvements existent déjà pour
  // cet inventaire (réessai sur un brouillon déjà partiellement traité), on ne
  // les recrée pas.
  const [alreadyRecorded] = await db.select({ id: stockMovements.id }).from(stockMovements)
    .where(and(
      eq(stockMovements.type, 'ajustement_inventaire'),
      eq(stockMovements.refType, 'inventory'),
      eq(stockMovements.refId, inv.id),
    )).limit(1);

  const gaps: InventoryGap[] = [];
  for (const [productId, qtyCounted] of byProduct) {
    const p = productById.get(productId)!;
    const theoretical = await getProductStock(db, input.locationId, productId);
    const gap = round3(qtyCounted - theoretical);
    gaps.push({
      productId, name: p.name,
      qtyTheoretical: theoretical, qtyCounted,
      gap, gapValue: Math.round(gap * p.purchasePrice),
    });
    // Mouvement (fait foi pour le stock) avant la ligne de détail.
    if (gap !== 0 && !alreadyRecorded) {
      await db.insert(stockMovements).values({
        productId, locationId: input.locationId,
        type: 'ajustement_inventaire', qty: String(gap),
        refType: 'inventory', refId: inv.id, userId: input.countedBy,
      });
    }
    await db.insert(inventoryLines).values({
      inventoryId: inv.id, productId,
      qtyTheoretical: String(theoretical), qtyCounted: String(qtyCounted),
    });
  }

  // Étape finale : bascule du statut, signal de succès de l'opération complète.
  await db.update(inventories).set({ status: 'valide' }).where(eq(inventories.id, inv.id));

  return { ok: true, gaps };
}
