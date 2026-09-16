import type { FastifyInstance } from 'fastify';
import PgBoss from 'pg-boss';
import type { Env } from '../env.js';
import type { JobName } from './names.js';

type Log = { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };

/** pg-boss keeps its queue tables in the same Postgres, schema `pgboss`. No Redis. */
export async function startBoss(env: Env, log: Log) {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss', max: 3 });
  boss.on('error', (err) => log.error({ err }, 'pg-boss error'));
  await boss.start();
  return boss;
}

let apiBoss: PgBoss | null = null;

/**
 * The web process only *sends* jobs. It shares a lazily-started PgBoss
 * instance that never registers workers, so all execution happens in the
 * worker process group.
 */
export async function sendJob(app: FastifyInstance, name: JobName, data: object) {
  if (!apiBoss) {
    apiBoss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: 'pgboss', max: 2 });
    apiBoss.on('error', (err) => app.log.error({ err }, 'pg-boss (sender) error'));
    await apiBoss.start();
    app.addHook('onClose', async () => {
      await apiBoss?.stop({ graceful: false });
      apiBoss = null;
    });
  }
  await apiBoss.createQueue(name).catch(() => {});
  return apiBoss.send(name, data);
}
