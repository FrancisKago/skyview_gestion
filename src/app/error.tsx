'use client';

// Error boundary global : intercepte notamment le throw de requireRole()
// (« Accès refusé pour ce rôle ») pour éviter l'écran de crash par défaut de Next.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  void error;
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-night">
      <div className="w-full max-w-sm bg-card border border-line rounded-xl p-6 space-y-4 text-center">
        <h1 className="font-display text-xl font-bold text-cream">Accès refusé ou erreur inattendue</h1>
        <p className="text-muted text-sm">
          Vous n&apos;avez pas les droits nécessaires, ou une erreur s&apos;est produite.
        </p>
        <button
          onClick={() => { window.location.href = '/login'; }}
          className="w-full min-h-12 bg-action hover:bg-action-hover text-white rounded-[10px] p-3 font-semibold transition-colors"
        >
          Retour à la connexion
        </button>
      </div>
    </main>
  );
}
