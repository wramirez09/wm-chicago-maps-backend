import { sql } from '@wm/db';
import type { JobHandler } from './index.js';

/**
 * Weekly "what changed in your neighborhood" digest. Push delivery lands with
 * the plumbing group of /add-chicago-apis (firebase-admin); for now this only
 * logs what it would send so the job plumbing can be exercised end to end.
 */
export const notifyDigest: JobHandler<Record<string, never>> = async ({ db, log }) => {
  // Changes in the last 7 days grouped by area.
  const rows = await db.execute(
    sql`select community_area, count(*)::int as n from area_changes where occurred_at > now() - interval '7 days' group by 1 order by 2 desc`,
  );
  log.info({ areas: rows.length }, 'digest computed (delivery not wired yet)');
};
