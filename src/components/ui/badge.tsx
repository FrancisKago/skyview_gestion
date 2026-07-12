type Tone = 'warning' | 'negative' | 'success' | 'neutral';
const TONES: Record<Tone, string> = {
  warning: 'bg-warning/15 text-warning border-warning/35',
  negative: 'bg-negative/15 text-negative border-negative/35',
  success: 'bg-success/15 text-success border-success/35',
  neutral: 'bg-surface text-muted border-line',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${TONES[tone]}`}>
      {children}
    </span>
  );
}
