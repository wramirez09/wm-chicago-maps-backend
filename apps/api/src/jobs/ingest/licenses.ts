import { areaChanges, communityAreas, eq, licenses, owners, pointFrom, sql } from '@wm/db';
import { CHICAGO_PORTAL, DATASETS, socrataPages } from '../../upstream/socrata.js';
import type { JobHandler } from '../index.js';

type LicenseRow = {
  id: string; license_id: string; account_number: string; site_number: string; legal_name: string; doing_business_as_name?: string;
  address?: string; license_description?: string; license_status?: string; license_start_date?: string; expiration_date?: string;
  community_area?: string; community_area_name?: string; latitude?: string; longitude?: string;
};
type OwnerRow = { account_number: string; owner_first_name?: string; owner_last_name?: string; legal_entity_owner?: string; title?: string };

/**
 * Nightly pull of current business licenses + owners. New license ids since
 * the last run become `opened` changes; ids that stop appearing become
 * `closed`. This diff is what feeds GET /areas/:slug/changes and the digest.
 */
export const ingestLicenses: JobHandler<Record<string, never>> = async ({ db, env, log }) => {
  const areaByNumber = new Map((await db.select({ number: communityAreas.number, slug: communityAreas.slug }).from(communityAreas)).map((a) => [a.number, a.slug]));
  const before = new Set((await db.select({ id: licenses.licenseId }).from(licenses)).map((r) => r.id));
  const seen = new Set<string>();
  const runStarted = new Date();
  let inserted = 0;

  for await (const page of socrataPages<LicenseRow>(env, CHICAGO_PORTAL, DATASETS.businessLicensesCurrent, { where: "city = 'CHICAGO'", order: 'license_id' })) {
    for (const row of page) {
      seen.add(row.license_id);
      const lng = Number(row.longitude), lat = Number(row.latitude);
      const hasLoc = Number.isFinite(lng) && Number.isFinite(lat) && lng !== 0;
      const areaSlug = row.community_area ? (areaByNumber.get(Number(row.community_area)) ?? null) : null;
      const values = {
        licenseId: row.license_id,
        accountNumber: row.account_number,
        siteNumber: Number(row.site_number) || 0,
        legalName: row.legal_name,
        doingBusinessAs: row.doing_business_as_name ?? null,
        address: row.address ?? null,
        licenseDescription: row.license_description ?? null,
        status: row.license_status ?? null,
        startDate: row.license_start_date ? new Date(row.license_start_date) : null,
        expirationDate: row.expiration_date ? new Date(row.expiration_date) : null,
        communityArea: areaSlug,
        location: hasLoc ? (pointFrom(lng, lat) as never) : null,
        raw: row,
        seenAt: runStarted,
      };
      await db.insert(licenses).values(values).onConflictDoUpdate({ target: licenses.licenseId, set: { ...values } });
      if (!before.has(row.license_id) && areaSlug && before.size > 0) {
        await db.insert(areaChanges).values({
          communityArea: areaSlug, kind: 'opened', occurredAt: values.startDate ?? runStarted, licenseId: row.license_id,
          name: row.doing_business_as_name ?? row.legal_name, address: row.address ?? null, detail: row.license_description ?? null,
        });
        inserted++;
      }
    }
  }

  // Licenses that disappeared from the "current active" dataset.
  let closed = 0;
  for (const id of before) {
    if (seen.has(id)) continue;
    const [lic] = await db.select().from(licenses).where(eq(licenses.licenseId, id)).limit(1);
    if (lic?.communityArea) {
      await db.insert(areaChanges).values({ communityArea: lic.communityArea, kind: 'closed', occurredAt: runStarted, licenseId: id, name: lic.doingBusinessAs ?? lic.legalName, address: lic.address, detail: lic.licenseDescription });
      closed++;
    }
    await db.delete(licenses).where(eq(licenses.licenseId, id));
  }

  let ownerRows = 0;
  for await (const page of socrataPages<OwnerRow>(env, CHICAGO_PORTAL, DATASETS.businessOwners, { order: 'account_number' })) {
    for (const row of page) {
      await db
        .insert(owners)
        .values({ accountNumber: row.account_number, ownerFirstName: row.owner_first_name ?? null, ownerLastName: row.owner_last_name ?? null, legalEntityOwner: row.legal_entity_owner ?? null, title: row.title ?? null, raw: row, seenAt: runStarted })
        .onConflictDoUpdate({ target: [owners.accountNumber, owners.ownerFirstName, owners.ownerLastName, owners.legalEntityOwner], set: { title: row.title ?? null, raw: row, seenAt: sql`now()` } });
      ownerRows++;
    }
  }
  log.info({ licenses: seen.size, opened: inserted, closed, ownerRows }, 'licenses ingested');
};
