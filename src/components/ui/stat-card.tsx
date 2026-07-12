export function StatCard({ label, value, tone = 'money' }: {
  label: string; value: string; tone?: 'money' | 'negative' | 'neutral';
}) {
  const color = tone === 'money' ? 'text-money' : tone === 'negative' ? 'text-negative' : 'text-cream';
  return (
    <div className="bg-gradient-to-br from-card to-surface border border-line rounded-xl p-4">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className={`text-2xl font-bold tnum ${color}`}>{value}</p>
    </div>
  );
}
