'use client';
import { useState } from 'react';
import { SearchBox } from '@/components/ui/search-box';
import { ListRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { matchesQuery } from '@/lib/text';

export interface StockItem {
  productId: number; name: string; baseUnit: string;
  qty: number; value: number; belowThreshold: boolean;
}

export function StockList({ items }: { items: StockItem[] }) {
  const [query, setQuery] = useState('');
  const visible = items.filter((i) => matchesQuery(i.name, query));
  return (
    <div className="space-y-2">
      <SearchBox value={query} onChange={setQuery} />
      {visible.map((l) => (
        <ListRow key={l.productId} tone={l.qty < 0 ? 'negative' : l.belowThreshold ? 'warning' : 'default'}>
          <span>
            <span className="font-semibold text-cream">{l.name}</span>
            {l.qty < 0 && <span className="ml-2 align-middle"><Badge tone="negative">négatif !</Badge></span>}
            {l.qty >= 0 && l.belowThreshold && <span className="ml-2 align-middle"><Badge tone="warning">seuil bas</Badge></span>}
            <br /><span className="text-sm text-money tnum">{l.value.toLocaleString('fr-FR')} FCFA</span>
          </span>
          <span className={`text-lg font-bold tnum text-right ${l.qty < 0 ? 'text-negative' : l.belowThreshold ? 'text-warning' : 'text-cream'}`}>
            {l.qty}<br /><span className="text-xs font-normal text-muted">{l.baseUnit}</span>
          </span>
        </ListRow>
      ))}
      {visible.length === 0 && <p className="text-muted text-sm p-2">Aucun produit ne correspond.</p>}
    </div>
  );
}
