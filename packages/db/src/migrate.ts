import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './client.js';

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_DIRECT (or DATABASE_URL) is required');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '..', 'drizzle');

const { db, close } = createDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder });
  console.log('migrations applied');
} finally {
  await close();
}
