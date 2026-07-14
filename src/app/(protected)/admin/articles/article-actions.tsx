'use client';
import { useActionState } from 'react';
import { FormError } from '@/components/ui/form-error';
import { archiveSaleArticleAction, deleteSaleArticleAction } from './actions';

// Archiver/Désarchiver toujours proposé ; Supprimer seulement si l'article
// n'est référencé nulle part (le serveur revérifie via deleteSaleArticle).
// Fichier client séparé : la liste des articles vit dans le Server Component page.tsx.
export function ArticleActions({ id, name, active, deletable }: {
  id: number; name: string; active: boolean; deletable: boolean;
}) {
  const [archState, archAction] = useActionState(archiveSaleArticleAction, {});
  const [delState, delAction] = useActionState(deleteSaleArticleAction, {});
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
