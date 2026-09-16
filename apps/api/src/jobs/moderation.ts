import { and, eq, isNull, licenses, places, sql, submissions, withinMeters } from '@wm/db';
import { CHICAGO_BBOX, PlaceSubmission } from '@wm/shared';
import type { JobHandler } from './index.js';

/**
 * Cheap automatic checks that run before a human sees a submission:
 * duplicate within 60 m with a similar name, inside city bbox, and whether a
 * business license exists at roughly that location with a matching name.
 */
export const moderationAutocheck: JobHandler<{ submissionId: string }> = async ({ db, log }, { submissionId }) => {
  const [s] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!s) return;
  const payload = PlaceSubmission.parse(s.payload);
  const [lng, lat] = payload.location.coordinates;
  const insideChicago = lng >= CHICAGO_BBOX[0] && lng <= CHICAGO_BBOX[2] && lat >= CHICAGO_BBOX[1] && lat <= CHICAGO_BBOX[3];

  const [dupe] = await db
    .select({ id: places.id })
    .from(places)
    .where(and(withinMeters(places.location, lng, lat, 60), isNull(places.closedAt), sql`similarity(${places.name}, ${payload.name}) > 0.4`))
    .limit(1);

  const [lic] = await db
    .select({ id: licenses.licenseId, dba: licenses.doingBusinessAs, legal: licenses.legalName })
    .from(licenses)
    .where(and(withinMeters(licenses.location, lng, lat, 80), sql`similarity(coalesce(${licenses.doingBusinessAs}, ${licenses.legalName}), ${payload.name}) > 0.3`))
    .limit(1);

  const autochecks = { duplicateOf: dupe?.id ?? null, insideChicago, licenseMatch: lic ? `${lic.id}: ${lic.dba ?? lic.legal}` : null };
  await db.update(submissions).set({ autochecks, updatedAt: new Date() }).where(eq(submissions.id, submissionId));
  log.info({ submissionId, autochecks }, 'autocheck complete');
};
