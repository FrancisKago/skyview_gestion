import { eq, inArray } from 'drizzle-orm';
import { serviceExits, serviceExitLines, stockMovements, products } from '@/db/schema';
import { getProductStock } from './stock';
import { round3 } from './units';
import { isValidDateString } from './dates';
import type { AnyDb } from '@/db';

export interface RecordServiceExitInput {
  locationId: number;
  serviceDate: string;
  createdBy: number;
  lines: Array<{ productId: number; qty: number }>;
  // Jeton généré côté client (un par soumission de formulaire) : cf. garde d'idempotence
  // ci-dessous. Optionnel pour ne pas casser les appels serveur internes existants.
  clientToken?: string;
}

// Garde d'idempotence via jeton client (contrairement à receiveOrder, il n'y a pas de statut
// de commande à vérifier ici — chaque appel représente une NOUVELLE saisie). Le formulaire
// génère un UUID à l'affichage et le renvoie tel quel ; un double-submit (double-clic, retry
// réseau) transmet donc deux fois le MÊME jeton. On vérifie d'abord si une sortie avec ce
// jeton existe déjà : si oui, on ne réécrit rien et on renvoie un succès idempotent
// (duplicate: true). Risque résiduel accepté v1 : course entre deux double-clics quasi
// simultanés AVANT que le premier insert ne committe — la contrainte UNIQUE sur client_token
// fait alors échouer le second insert avec une exception, rattrapée par le try/catch de
// l'action serveur (src/app/(protected)/sorties/actions.ts) qui renvoie une erreur générique
// au lieu de dupliquer le stock. Acceptable pour v1 avec un seul barman/cuisinier par
// emplacement à la fois.
// Ordre des écritures (sans transaction) : serviceExits → stockMovements → serviceExitLines.
// Les mouvements (qui font foi pour le stock) sont insérés AVANT les lignes de détail
// (affichage seul) : un échec en cours de séquence laisse alors le stock CORRECT avec
// seulement le détail manquant. Risque résiduel accepté v1 (hors double-submit, couvert
// ci-dessus) : sortie créée mais crash avant les mouvements → le réessai de l'utilisateur
// avec le MÊME jeton (le formulaire ne le régénère qu'après un succès) sera bloqué par la
// contrainte UNIQUE — un jeton différent créerait une seconde sortie (la première reste vide).
export async function recordServiceExit(db: AnyDb, input: RecordServiceExitInput):
  Promise<{ ok: boolean; warnings?: string[]; error?: string; duplicate?: boolean }> {
  if (input.clientToken) {
    const [existing] = await db.select({ id: serviceExits.id }).from(serviceExits)
      .where(eq(serviceExits.clientToken, input.clientToken)).limit(1);
    if (existing) return { ok: true, warnings: [], duplicate: true };
  }
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
  const found = await db.select({ id: products.id, name: products.name, active: products.active })
    .from(products).where(inArray(products.id, productIds));
  if (found.length !== productIds.length) {
    return { ok: false, error: 'Produit inconnu dans la saisie' };
  }
  // Garde serveur (spec durcissement §4) : l'UI filtre déjà les inactifs,
  // ceci bloque les POST forgés.
  const inactive = found.find((p: { active: boolean }) => !p.active);
  if (inactive) return { ok: false, error: `Produit désactivé : « ${inactive.name} »` };
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
    clientToken: input.clientToken ?? null,
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
