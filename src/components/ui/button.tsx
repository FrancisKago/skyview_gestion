'use client';
import { Loader2 } from 'lucide-react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  pending?: boolean;
};

export function Button({ variant = 'primary', pending, children, className = '', disabled, ...rest }: Props) {
  const base = 'min-h-12 rounded-[10px] px-5 font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-action';
  const look = variant === 'primary'
    ? 'bg-action hover:bg-action-hover text-white'
    : 'border border-line text-cream hover:bg-surface';
  return (
    <button disabled={disabled || pending} className={`${base} ${look} ${className}`} {...rest}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
