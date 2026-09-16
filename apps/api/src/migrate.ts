/** Release-time migration runner (Fly `release_command`). Bundled by tsup so the image needs no ts tooling. */
import { createDb } from '@wm/db';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';

const env = loadEnv();
const url = env.DATABASE_URL_DIRECT ?? env.DATABASE_URL;
const here = dirname(fileURLToPath(import.meta.url));
// dist/migrate.js → ../drizzle in the image; ../../../packages/db/drizzle in the repo.
const candidates = [resolve(here, '..', 'drizzle'), resolve(here, '..', '..', '..', 'packages', 'db', 'drizzle')];
const { existsSync } = await import('node:fs');
const migrationsFolder = candidates.find((c) => existsSync(c));
if (!migrationsFolder) throw new Error(`migrations folder not found in ${candidates.join(', ')}`);

const { db, close } = createDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder });
  console.log(`migrations applied from ${migrationsFolder}`);
} finally {
  await close();
}
