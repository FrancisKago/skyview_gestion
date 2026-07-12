type Tone = 'default' | 'warning' | 'negative';
const EDGES: Record<Tone, string> = {
  default: 'border-line',
  warning: 'border-warning/40',
  negative: 'border-negative/40',
};

export function Card({ tone = 'default', className = '', children }: {
  tone?: Tone; className?: string; children: React.ReactNode;
}) {
  return <div className={`bg-card border rounded-xl ${EDGES[tone]} ${className}`}>{children}</div>;
}

// Ligne de liste : padding standard + flex, dans une Card ou un <ul> stylé.
export function ListRow({ tone = 'default', className = '', children }: {
  tone?: Tone; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`bg-card border rounded-xl ${EDGES[tone]} p-3 flex items-center justify-between gap-3 ${className}`}>
      {children}
    </div>
  );
}
