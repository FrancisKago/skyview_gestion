'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { SearchBox } from '@/components/ui/search-box';
import { ListRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/ui/form-error';
import { matchesQuery } from '@/lib/text';
import { archiveProductAction, deleteProductAction } from './actions';

export interface ProductListItem {
  id: number; name: string; baseUnit: string;
  packName: string | null; packSize: number | null;
  purchasePrice: number; active: boolean; deletable: boolean;
}

// Archiver/Désarchiver toujours proposé ; Supprimer seulement si le produit
// n'est référencé nulle part (le serveur revérifie via deleteProduct).
function RowActions({ id, name, active, deletable }: {
  id: number; name: string; active: boolean; deletable: boolean;
}) {
  const [archState, archAction] = useActionState(archiveProductAction, {});
  const [delState, delAction] = useActionState(deleteProductAction, {});
  return (
    <span className="flex flex-col items-end gap-1 shrink-0">
      <form action={archAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="archived" value={active ? '1' : '0'} />
        <button type="submit" className="text-muted text-xs underline underline-offset-4">
          {active ? 'Archiver' : 'Désarchiver'}
        </button>
      </form>
      {deletable && (
        <form action={delAction}
          onSubmit={(e) => {
            if (!confirm(`Supprimer définitivement « ${name} » ? Cette action est irréversible.`)) e.preventDefault();
          }}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="text-negative text-xs underline underline-offset-4">Supprimer</button>
        </form>
      )}
      <FormError message={archState.error ?? delState.error} />
    </span>
  );
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
            {!p.active && <span className="ml-2 align-middle"><Badge tone="neutral">archivé</Badge></span>}
            <br />
            <span className="text-sm text-muted">
              {p.baseUnit}{p.packName ? ` — ${p.packName} de ${p.packSize}` : ''}
            </span>
          </span>
          <span className="text-money tnum">{p.purchasePrice.toLocaleString('fr-FR')} FCFA</span>
          <span className="flex flex-col items-end gap-1 shrink-0">
            <Link href={`/admin/produits?edit=${p.id}`} className="text-action text-xs underline underline-offset-4">Modifier</Link>
            <RowActions id={p.id} name={p.name} active={p.active} deletable={p.deletable} />
          </span>
        </ListRow>
      ))}
      {visible.length === 0 && <p className="text-muted text-sm p-2">Aucun produit ne correspond.</p>}
    </div>
  );
}
