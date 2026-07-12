'use client';
import { Search } from 'lucide-react';

export function SearchBox({ value, onChange, placeholder = 'Rechercher un produit…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-2 bg-card border border-line rounded-[10px] px-3 min-h-12 focus-within:outline-2 focus-within:outline-action">
      <Search className="size-4 text-muted shrink-0" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="bg-transparent flex-1 text-cream placeholder:text-muted outline-none" />
    </label>
  );
}
