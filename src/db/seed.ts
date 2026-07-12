// src/db/seed.ts — usage : ADMIN_PASSWORD=... npx tsx src/db/seed.ts (DATABASE_URL lu depuis .env.local)
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import bcrypt from 'bcryptjs';
import * as schema from './schema';

// tsx (contrairement à Next.js) ne charge aucun fichier .env automatiquement :
// on lit .env.local en priorité, avec .env en repli.
config({ path: '.env.local' });
config(); // .env en repli

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL requis');
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD requis');

  const db = drizzle(neon(databaseUrl), { schema });

  await db.insert(schema.locations).values([
    { name: 'Magasin', type: 'magasin' },
    { name: 'Bar', type: 'bar' },
    { name: 'Cuisine', type: 'cuisine' },
  ]).onConflictDoNothing();

  await db.insert(schema.users).values({
    name: 'Administrateur',
    username: 'admin',
    passwordHash: await bcrypt.hash(password, 10),
    role: 'admin',
  }).onConflictDoNothing();

  console.log('Seed OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
