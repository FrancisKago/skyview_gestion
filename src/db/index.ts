import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// `neon()` throws synchronously at call time if given `undefined` (e.g. "No database
// connection string was provided to `neon()`"). A syntactically valid placeholder URL
// does NOT throw here — the HTTP client is lazy and only attempts a connection when a
// query actually runs. This keeps `import '@/db'` safe in test processes that don't set
// DATABASE_URL (tests only need the `AnyDb` type, never this `db` instance).
const sql = neon(process.env.DATABASE_URL ?? 'postgres://user:pass@localhost/db');
export const db = drizzle(sql, { schema });
export type Db = typeof db;

// Union réelle des deux clients (prod Neon HTTP, tests PGlite) — remplace le `any`
// historique. Types effacés à la compilation ; @electric-sql/pglite est en devDeps,
// disponible pour tsc au build.
export type AnyDb = NeonHttpDatabase<typeof schema> | PgliteDatabase<typeof schema>;
