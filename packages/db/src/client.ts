import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(url: string, opts: { max?: number; prepare?: boolean } = {}) {
  const client = postgres(url, {
    max: opts.max ?? 10,
    // Transaction-mode poolers (PgBouncer/Supavisor) do not support prepared statements.
    prepare: opts.prepare ?? true,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}
