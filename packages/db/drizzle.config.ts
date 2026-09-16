import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '' },
  // PostGIS geography columns are declared via customType; drizzle-kit does not
  // introspect them, so we never run `push` — always `generate` + `migrate`.
  strict: true,
  verbose: true,
});
