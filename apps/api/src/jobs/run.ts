/**
 * Run one job inline, without the queue.
 * In a container: `node dist/jobs/run.js ingest.layers`.
 * On the host: `pnpm --filter @wm/api job:run ingest.layers`.
 * Used for backfills and local development.
 */
import { createDb } from '@wm/db';
import pino from 'pino';
import { loadEnv } from '../env.js';
import { HANDLERS } from './index.js';
import type { JobName } from './names.js';

const name = process.argv[2] as JobName | undefined;
const data = process.argv[3] ? (JSON.parse(process.argv[3]) as object) : {};
if (!name || !(name in HANDLERS)) {
  console.error(`usage: job:run <${Object.keys(HANDLERS).join('|')}> [json-data]`);
  process.exit(1);
}
const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL, transport: { target: 'pino-pretty' } });
const { db, close } = createDb(env.DATABASE_URL, { max: 3, prepare: false });
try {
  await HANDLERS[name]({ boss: null as never, db, env, log }, data as never);
} finally {
  await close();
}
