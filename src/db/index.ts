import { drizzle } from 'drizzle-orm/neon-http';
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

// Accepte le client Neon comme le client PGlite des tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = any;
