import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

// Seed minimal réutilisable : 3 emplacements + un utilisateur par rôle.
export async function seedBase(db: TestDb) {
  const [magasin, bar, cuisine] = await db.insert(schema.locations).values([
    { name: 'Magasin', type: 'magasin' },
    { name: 'Bar', type: 'bar' },
    { name: 'Cuisine', type: 'cuisine' },
  ]).returning();
  const [admin, magasinier, barman, cuisinier, comptable] =
    await db.insert(schema.users).values([
      { name: 'Admin', username: 'admin', passwordHash: 'x', role: 'admin' },
      { name: 'Mag', username: 'mag', passwordHash: 'x', role: 'magasinier' },
      { name: 'Bar', username: 'bar', passwordHash: 'x', role: 'barman' },
      { name: 'Cuis', username: 'cuis', passwordHash: 'x', role: 'cuisinier' },
      { name: 'Compta', username: 'compta', passwordHash: 'x', role: 'comptable' },
    ]).returning();
  return { magasin, bar, cuisine, admin, magasinier, barman, cuisinier, comptable };
}
