import { db } from '@/db';
import { products } from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { ProductForm } from './product-form';

export const dynamic = 'force-dynamic';

export default async function ProduitsPage() {
  await requireRole(['admin']);
  const rows = await db.select().from(products).orderBy(asc(products.name));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Produits</h1>
      <ProductForm />
      <ul className="divide-y bg-white rounded-xl shadow">
        {rows.map((p) => (
          <li key={p.id} className="p-3 text-sm flex justify-between">
            <span>
              <b>{p.name}</b> {!p.active && <em className="text-gray-400">(inactif)</em>}
              <br />
              <span className="text-gray-500">
                {p.baseUnit}{p.packName ? ` — ${p.packName} de ${Number(p.packSize)}` : ''} — {p.purchasePrice} FCFA
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
