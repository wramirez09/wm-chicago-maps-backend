export const JOBS = {
  ingestLayers: 'ingest.layers',
  ingestAreas: 'ingest.areas',
  ingestLicenses: 'ingest.licenses',
  ingestEvents: 'ingest.events',
  moderationAutocheck: 'moderation.autocheck',
  notifyDigest: 'notify.digest',
} as const;
export type JobName = (typeof JOBS)[keyof typeof JOBS];

/** Cron schedules (UTC). Chicago is UTC-5/-6, so 09:00 UTC ≈ 3–4am local. */
export const SCHEDULES: Partial<Record<JobName, string>> = {
  [JOBS.ingestLicenses]: '0 9 * * *',
  [JOBS.ingestEvents]: '15 * * * *',
  [JOBS.ingestLayers]: '0 10 * * 0',
  [JOBS.ingestAreas]: '30 10 1 * *',
  [JOBS.notifyDigest]: '0 15 * * 4',
};
