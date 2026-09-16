import type { Db } from '@wm/db';
import type PgBoss from 'pg-boss';
import type { Env } from '../env.js';
import { ingestAreas } from './ingest/areas.js';
import { ingestEvents } from './ingest/events.js';
import { ingestLayers } from './ingest/layers.js';
import { ingestLicenses } from './ingest/licenses.js';
import { moderationAutocheck } from './moderation.js';
import { JOBS, SCHEDULES, type JobName } from './names.js';
import { notifyDigest } from './notify.js';

export type JobContext = {
  boss: PgBoss;
  db: Db;
  env: Env;
  log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };
};
export type JobHandler<T = unknown> = (ctx: JobContext, data: T) => Promise<void>;

export const HANDLERS: Record<JobName, JobHandler<never>> = {
  [JOBS.ingestLayers]: ingestLayers,
  [JOBS.ingestAreas]: ingestAreas,
  [JOBS.ingestLicenses]: ingestLicenses,
  [JOBS.ingestEvents]: ingestEvents,
  [JOBS.moderationAutocheck]: moderationAutocheck,
  [JOBS.notifyDigest]: notifyDigest,
};

export async function registerJobs(ctx: JobContext) {
  for (const [name, handler] of Object.entries(HANDLERS) as [JobName, JobHandler][]) {
    await ctx.boss.createQueue(name).catch(() => {});
    await ctx.boss.work(name, { batchSize: 1 }, async ([job]) => {
      if (!job) return;
      const started = Date.now();
      ctx.log.info({ job: name, id: job.id }, 'job start');
      try {
        await handler(ctx, job.data);
        ctx.log.info({ job: name, id: job.id, ms: Date.now() - started }, 'job done');
      } catch (err) {
        ctx.log.error({ job: name, id: job.id, err }, 'job failed');
        throw err;
      }
    });
    const cron = SCHEDULES[name];
    if (cron) await ctx.boss.schedule(name, cron, {}, { tz: 'UTC' });
  }
}
