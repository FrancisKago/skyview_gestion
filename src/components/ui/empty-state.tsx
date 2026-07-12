import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, message, actionHref, actionLabel }: {
  icon: LucideIcon; message: string; actionHref?: string; actionLabel?: string;
}) {
  return (
    <div className="bg-card border border-line rounded-xl p-8 text-center space-y-3">
      <Icon className="size-8 text-muted mx-auto" aria-hidden />
      <p className="text-muted">{message}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="inline-block text-action font-semibold underline underline-offset-4">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
