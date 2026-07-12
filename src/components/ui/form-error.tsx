import { CircleAlert } from 'lucide-react';

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 bg-negative/10 border border-negative/40 rounded-[10px] p-3 text-sm text-negative">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}
