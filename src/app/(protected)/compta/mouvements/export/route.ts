import { NextRequest } from 'next/server';
import { asc, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { locations, recipeLines, saleArticles } from '@/db/schema';
import { getSession } from '@/lib/session';
import { isValidDateString, toDateStr } from '@/lib/dates';
import { getMovementReport } from '@/lib/movement-report';
import { buildMovementExport } from '@/lib/movement-export';

// GET /compta/mouvements/export?format=csv|xlsx&du=…&au=…&emplacement=…&produit=…&article=…
// Mêmes défauts et mêmes règles de filtres que la page Mouvements (duplication assumée :
// la page est un composant serveur intouché, la logique tient en quelques lignes).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'comptable' && session.role !== 'admin')) {
    return new Response('Accès refusé', { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format');
  if (format !== 'csv' && format !== 'xlsx') {
    return new Response('Paramètres invalides', { status: 400 });
  }
  const now = new Date();
  const defaultDu = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultAu = toDateStr(now);
  let du = sp.get('du') && isValidDateString(sp.get('du')!) ? sp.get('du')! : defaultDu;
  let au = sp.get('au') && isValidDateString(sp.get('au')!) ? sp.get('au')! : defaultAu;
  if (du > au) { du = defaultDu; au = defaultAu; }

  const locs = await db.select().from(locations).where(ne(locations.type, 'magasin')).orderBy(asc(locations.name));
  const emplacementId = Number(sp.get('emplacement'));
  const selected = locs.some((l) => l.id === emplacementId)
    ? locs.filter((l) => l.id === emplacementId) : locs;

  const produitId = Number(sp.get('produit'));
  const articleId = Number(sp.get('article'));
  let productIds: number[] | undefined;
  if (Number.isFinite(produitId) && produitId > 0) {
    productIds = [produitId];
  } else if (Number.isFinite(articleId) && articleId > 0) {
    const [art] = await db.select({ id: saleArticles.id }).from(saleArticles)
      .where(eq(saleArticles.id, articleId));
    if (art) {
      const lines = await db.select({ productId: recipeLines.productId })
        .from(recipeLines).where(eq(recipeLines.saleArticleId, art.id));
      productIds = [...new Set(lines.map((l) => l.productId))];
    }
  }

  const sections = await Promise.all(selected.map(async (loc) => ({
    locationName: loc.name,
    lines: await getMovementReport(db, { from: du, to: au, locationId: loc.id, productIds }),
  })));
  const t = buildMovementExport(sections, { format, from: du, to: au });
  return new Response(new Uint8Array(t.buffer), {
    headers: {
      'Content-Type': t.contentType,
      'Content-Disposition': `attachment; filename="${t.filename}"`,
    },
  });
}
