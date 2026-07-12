import Link from 'next/link';
import { db } from '@/db';
import { users } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { ListRow } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserForm } from './user-form';
import { toggleUserAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function UtilisateursPage({ searchParams }: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireRole(['admin']);
  const { edit } = await searchParams;
  const editId = edit != null && Number.isFinite(Number(edit)) ? Number(edit) : null;
  const editing = editId != null
    ? (await db.select().from(users).where(eq(users.id, editId)))[0]
    : undefined;
  const rows = await db.select().from(users).orderBy(asc(users.role), asc(users.name));
  return (
    <div className="space-y-4">
      <PageHeader title="Utilisateurs" />
      <UserForm key={editing?.id ?? 'new'} initial={editing ? {
        id: editing.id, name: editing.name, username: editing.username, role: editing.role,
      } : undefined} />
      <div className="space-y-2">
        {rows.map((u) => (
          <ListRow key={u.id}>
            <span>
              <span className="font-semibold text-cream">{u.name}</span>
              {!u.active && <span className="ml-2 align-middle"><Badge tone="neutral">désactivé</Badge></span>}
              <br />
              <span className="text-sm text-muted">{u.username} — {u.role}</span>
            </span>
            <form action={toggleUserAction}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="active" value={String(!u.active)} />
              <Button type="submit" variant="ghost" className="min-h-9 px-3 text-xs">
                {u.active ? 'Désactiver' : 'Réactiver'}
              </Button>
            </form>
            <Link href={`/admin/utilisateurs?edit=${u.id}`} className="text-action text-xs underline underline-offset-4 shrink-0">Modifier</Link>
          </ListRow>
        ))}
      </div>
    </div>
  );
}
