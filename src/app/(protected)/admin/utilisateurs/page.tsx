import { db } from '@/db';
import { users } from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireRole } from '@/lib/session';
import { UserForm } from './user-form';
import { toggleUserAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function UtilisateursPage() {
  await requireRole(['admin']);
  const rows = await db.select().from(users).orderBy(asc(users.role), asc(users.name));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Utilisateurs</h1>
      <UserForm />
      <ul className="divide-y bg-white rounded-xl shadow">
        {rows.map((u) => (
          <li key={u.id} className="p-3 text-sm flex justify-between items-center">
            <span><b>{u.name}</b> ({u.username}) — {u.role}
              {!u.active && <em className="text-gray-400"> — désactivé</em>}</span>
            <form action={toggleUserAction}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="active" value={String(!u.active)} />
              <button className="text-xs underline text-indigo-600">
                {u.active ? 'Désactiver' : 'Réactiver'}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
