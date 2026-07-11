import { eq } from 'drizzle-orm';
import { products } from '@/db/schema';
import type { AnyDb } from '@/db';

export interface ProductInput {
  id?: number;
  name: string;
  category?: string;
  baseUnit: string;
  packName?: string | null;
  packSize?: number | null;
  purchasePrice: number;
  alertThreshold?: number | null;
  active?: boolean;
}

export async function saveProduct(db: AnyDb, input: ProductInput):
  Promise<{ ok: boolean; id?: number; error?: string }> {
  // Normalisation AVANT validation : un packName composé d'espaces doit être
  // traité comme absent par la règle XOR ci-dessous.
  const name = input.name?.trim() ?? '';
  const baseUnit = input.baseUnit?.trim() ?? '';
  const packName = input.packName?.trim() || null;

  if (!name) return { ok: false, error: 'Le nom est obligatoire' };
  if (!baseUnit) return { ok: false, error: "L'unité de base est obligatoire" };
  if (!Number.isFinite(input.purchasePrice)) {
    return { ok: false, error: 'Le prix doit être un nombre' };
  }
  if (input.purchasePrice < 0) return { ok: false, error: 'Le prix ne peut pas être négatif' };
  if (input.packSize != null && !Number.isFinite(input.packSize)) {
    return { ok: false, error: 'La taille du conditionnement doit être un nombre' };
  }
  if (input.alertThreshold != null && !Number.isFinite(input.alertThreshold)) {
    return { ok: false, error: "Le seuil d'alerte doit être un nombre" };
  }
  if ((packName && input.packSize == null) || (!packName && input.packSize != null)) {
    return { ok: false, error: 'Conditionnement : renseigner le nom ET la taille' };
  }
  if (input.packSize != null && input.packSize <= 0) {
    return { ok: false, error: 'La taille du conditionnement doit être positive' };
  }
  const values = {
    name,
    category: input.category?.trim() ?? '',
    baseUnit,
    packName,
    packSize: input.packSize != null ? String(input.packSize) : null,
    purchasePrice: Math.round(input.purchasePrice),
    alertThreshold: input.alertThreshold != null ? String(input.alertThreshold) : null,
    active: input.active ?? true,
  };
  if (input.id) {
    await db.update(products).set(values).where(eq(products.id, input.id));
    return { ok: true, id: input.id };
  }
  const [row] = await db.insert(products).values(values).returning();
  return { ok: true, id: row.id };
}
