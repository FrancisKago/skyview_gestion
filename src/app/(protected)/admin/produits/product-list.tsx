'use client';
import { useState } from 'react';
import Link from 'next/link';
import { SearchBox } from '@/components/ui/search-box';
import { ListRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { matchesQuery } from '@/lib/text';

export interface ProductListItem {
  id: number; name: string; baseUnit: string;
  packName: string | null; packSize: number | null;
  purchasePrice: number; active: boolean;
}

export function ProductList({ products }: { products: ProductListItem[] }) {
  const [query, setQuery] = useState('');
  const visible = products.filter((p) => matchesQuery(p.name, query));
  return (
    <div className="space-y-2">
      <SearchBox value={query} onChange={setQuery} />
      {visible.map((p) => (
        <ListRow key={p.id}>
          <span>
            <span className="font-semibold text-cream">{p.name}</span>
            {!p.active && <span className="ml-2 align-middle"><Badge tone="neutral">inactif</Badge></span>}
            <br />
            <span className="text-sm text-muted">
              {p.baseUnit}{p.packName ? ` — ${p.packName} de ${p.packSize}` : ''}
            </span>
          </span>
          <span className="text-money tnum">{p.purchasePrice.toLocaleString('fr-FR')} FCFA</span>
          <Link href={`/admin/produits?edit=${p.id}`} className="text-action text-xs underline underline-offset-4 shrink-0">Modifier</Link>
        </ListRow>
      ))}
      {visible.length === 0 && <p className="text-muted text-sm p-2">Aucun produit ne correspond.</p>}
    </div>
  );
}
