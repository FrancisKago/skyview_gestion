'use client';
import { matchLineAction } from './actions';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';

type ArticleOption = { id: number; cashName: string };

// Garde anti-clic accidentel : une correspondance est mémorisée comme alias et
// s'applique aussi aux prochains imports — on exige une confirmation explicite
// avant l'envoi. La logique serveur reste inchangée (matchLineAction).
export function MatchForm({ lineId, raw, qty, articles }: {
  lineId: number; raw: string; qty: number; articles: ArticleOption[];
}) {
  return (
    <form
      action={matchLineAction}
      onSubmit={(e) => {
        const selected = (e.currentTarget.elements.namedItem('cashName') as HTMLInputElement | null)?.value ?? '';
        if (!selected) { e.preventDefault(); return; } // rien de sélectionné -> pas d'envoi
        if (!confirm(`Associer « ${raw} » à ${selected} ? Cette correspondance s'appliquera aussi aux prochains imports.`)) {
          e.preventDefault();
        }
      }}
      className="flex gap-2 items-center"
    >
      <input type="hidden" name="lineId" value={lineId} />
      <span className="flex-1 text-cream">« {raw} » (qté {qty})</span>
      <Combobox name="cashName" valueAs="label" placeholder="Article caisse…" className="flex-1 min-w-40"
        options={articles.map((a) => ({ id: a.id, label: a.cashName }))} />
      <Button type="submit" variant="ghost" className="min-h-9 px-3 text-xs">Associer</Button>
    </form>
  );
}
