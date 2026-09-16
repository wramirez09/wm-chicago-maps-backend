import { createDb } from '@wm/db';
import pino from 'pino';
import { loadEnv } from './env.js';
import { startBoss } from './jobs/boss.js';
import { registerJobs } from './jobs/index.js';

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const { db, close } = createDb(env.DATABASE_URL, { max: 5, prepare: false });

const boss = await startBoss(env, log);
await registerJobs({ boss, db, env, log });
log.info('worker ready');

const stop = async () => {
  log.info('worker stopping');
  await boss.stop({ graceful: true, timeout: 20_000 });
  await close();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
