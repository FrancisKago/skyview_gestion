'use client';

// Error boundary global : intercepte notamment le throw de requireRole()
// (« Accès refusé pour ce rôle ») pour éviter l'écran de crash par défaut de Next.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  void error;
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold">Accès refusé ou erreur inattendue</h1>
        <p className="text-sm text-gray-600">
          Vous n&apos;avez pas les droits nécessaires, ou une erreur s&apos;est produite.
        </p>
        <button
          onClick={() => { window.location.href = '/login'; }}
          className="w-full bg-indigo-600 text-white rounded-lg p-3 text-lg font-semibold"
        >
          Retour à la connexion
        </button>
      </div>
    </main>
  );
}
