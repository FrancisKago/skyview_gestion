'use client';
import { useRef } from 'react';
import { matchLineAction } from './actions';
import { Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';

type ArticleOption = { id: number; cashName: string };

// Garde anti-clic accidentel : une correspondance est mémorisée comme alias et
// s'applique aussi aux prochains imports — on exige une confirmation explicite
// avant l'envoi. La logique serveur reste inchangée (matchLineAction).
export function MatchForm({ lineId, raw, qty, articles }: {
  lineId: number; raw: string; qty: number; articles: ArticleOption[];
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  return (
    <form
      action={matchLineAction}
      onSubmit={(e) => {
        const selected = selectRef.current?.value ?? '';
        if (!confirm(`Associer « ${raw} » à ${selected} ? Cette correspondance s'appliquera aussi aux prochains imports.`)) {
          e.preventDefault();
        }
      }}
      className="flex gap-2 items-center"
    >
      <input type="hidden" name="lineId" value={lineId} />
      <span className="flex-1 text-cream">« {raw} » (qté {qty})</span>
      <Select ref={selectRef} name="cashName" className="min-h-9 p-1.5 text-sm">
        {articles.map((a) => <option key={a.id} value={a.cashName}>{a.cashName}</option>)}
      </Select>
      <Button type="submit" variant="ghost" className="min-h-9 px-3 text-xs">Associer</Button>
    </form>
  );
}
