import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit ne charge que .env automatiquement : on lit .env.local (convention
// Next.js utilisée par le reste du projet) en priorité, avec .env en repli.
config({ path: '.env.local' });
config(); // .env en repli

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://placeholder' },
});
