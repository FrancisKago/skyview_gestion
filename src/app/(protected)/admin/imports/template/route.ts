import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { buildTemplate } from '@/lib/templates';

// GET /admin/imports/template?type=produits|articles&format=xlsx|csv
// Le middleware protège déjà /admin/* ; on revérifie le rôle par défense en profondeur.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return new Response('Accès refusé', { status: 403 });
  }
  const type = req.nextUrl.searchParams.get('type');
  const format = req.nextUrl.searchParams.get('format');
  if ((type !== 'produits' && type !== 'articles') || (format !== 'xlsx' && format !== 'csv')) {
    return new Response('Paramètres invalides', { status: 400 });
  }
  const t = buildTemplate(type, format);
  return new Response(new Uint8Array(t.buffer), {
    headers: {
      'Content-Type': t.contentType,
      'Content-Disposition': `attachment; filename="${t.filename}"`,
    },
  });
}
