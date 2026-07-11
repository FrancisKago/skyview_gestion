import { inArray } from 'drizzle-orm';
import { serviceExits, serviceExitLines, stockMovements, products } from '@/db/schema';
import { getProductStock } from './stock';
import { round3 } from './units';
import type { AnyDb } from '@/db';

export interface RecordServiceExitInput {
  locationId: number;
  serviceDate: string;
  createdBy: number;
  lines: Array<{ productId: number; qty: number }>;
}

// Valide un YYYY-MM-DD réel (rejette '2026-02-31', 'not-a-date', etc.), pas
// seulement la forme de la chaîne : l'aller-retour via Date.UTC détecte les
// débordements de calendrier qu'une simple regex laisserait passer.
function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// v1 : pas de garde d'idempotence possible ici (contrairement à receiveOrder) — chaque appel
// représente une NOUVELLE saisie de sortie de service, il n'y a pas de statut de commande à
// vérifier pour détecter un doublon. La protection contre une double soumission (double-clic)
// est donc laissée au client (état "pending" du bouton) ; un vrai double envoi créerait deux
// sorties distinctes. Acceptable pour v1 avec un seul barman/cuisinier par emplacement à la fois.
// Ordre des écritures (sans transaction) : serviceExits → stockMovements → serviceExitLines.
// Les mouvements (qui font foi pour le stock) sont insérés AVANT les lignes de détail
// (affichage seul) : un échec en cours de séquence laisse alors le stock CORRECT avec
// seulement le détail manquant. Risque résiduel accepté v1 : sortie créée mais crash avant
// les mouvements → le réessai de l'utilisateur crée une seconde sortie (la première reste
// vide, sans effet sur le stock).
export async function recordServiceExit(db: AnyDb, input: RecordServiceExitInput):
  Promise<{ ok: boolean; warnings?: string[]; error?: string }> {
  const rawLines = input.lines.filter((l) => l.productId);
  if (!rawLines.length) return { ok: false, error: 'Saisissez au moins un produit sorti' };
  if (rawLines.some((l) => !Number.isFinite(l.qty) || !(l.qty > 0))) {
    return { ok: false, error: 'Les quantités doivent être positives' };
  }
  if (!isValidDateString(input.serviceDate)) {
    return { ok: false, error: 'Date de service invalide' };
  }
  // Fusion des doublons : un barman peut saisir le même produit deux fois (cf. createOrder).
  const byProduct = new Map<number, number>();
  for (const l of rawLines) {
    byProduct.set(l.productId, round3((byProduct.get(l.productId) ?? 0) + l.qty));
  }
  const productIds = [...byProduct.keys()];
  // Vérification d'existence des produits AVANT toute écriture (cf. createOrder) : sans elle,
  // la contrainte FK de service_exit_lines ne claquerait qu'APRÈS l'insert de la sortie,
  // laissant une sortie orpheline sans lignes.
  const found = await db.select({ id: products.id, name: products.name }).from(products)
    .where(inArray(products.id, productIds));
  if (found.length !== productIds.length) {
    return { ok: false, error: 'Produit inconnu dans la saisie' };
  }
  const nameById = new Map<number, string>(found.map((p: { id: number; name: string }) => [p.id, p.name]));

  // Avertissements stock négatif (règle métier : alerter sans bloquer, une sortie réelle
  // ne doit jamais être refusée pour cause d'écart de stock théorique).
  // Compromis assumés : requêtes getProductStock séquentielles (quelques lignes par sortie,
  // pas de batch nécessaire) et lecture non transactionnelle (TOCTOU) — l'avertissement est
  // purement informatif, un écart de course ne fausse jamais les écritures.
  const warnings: string[] = [];
  for (const [productId, qty] of byProduct) {
    const current = await getProductStock(db, input.locationId, productId);
    if (current - qty < 0) {
      const name = nameById.get(productId) ?? `Produit #${productId}`;
      warnings.push(`${name} : le stock devient négatif (${current} − ${qty})`);
    }
  }

  const [exit] = await db.insert(serviceExits).values({
    locationId: input.locationId, serviceDate: input.serviceDate, createdBy: input.createdBy,
  }).returning();
  await db.insert(stockMovements).values(
    [...byProduct.entries()].map(([productId, qty]) => ({
      productId, locationId: input.locationId, type: 'sortie_service' as const,
      qty: String(-qty), refType: 'service_exit', refId: exit.id, userId: input.createdBy,
    })),
  );
  await db.insert(serviceExitLines).values(
    [...byProduct.entries()].map(([productId, qty]) => ({
      serviceExitId: exit.id, productId, qty: String(qty),
    })),
  );
  return { ok: true, warnings };
}
