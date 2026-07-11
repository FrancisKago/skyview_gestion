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
  if (!input.name?.trim()) return { ok: false, error: 'Le nom est obligatoire' };
  if (!input.baseUnit?.trim()) return { ok: false, error: "L'unité de base est obligatoire" };
  if (input.purchasePrice < 0) return { ok: false, error: 'Le prix ne peut pas être négatif' };
  if ((input.packName && !input.packSize) || (!input.packName && input.packSize)) {
    return { ok: false, error: 'Conditionnement : renseigner le nom ET la taille' };
  }
  if (input.packSize != null && input.packSize <= 0) {
    return { ok: false, error: 'La taille du conditionnement doit être positive' };
  }
  const values = {
    name: input.name.trim(),
    category: input.category?.trim() ?? '',
    baseUnit: input.baseUnit.trim(),
    packName: input.packName?.trim() || null,
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
