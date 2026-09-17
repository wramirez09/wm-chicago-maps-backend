import { pgEnum } from 'drizzle-orm/pg-core';

export const independenceEnum = pgEnum('independence', ['verified', 'vouched', 'unverified', 'chain', 'excluded']);
export const placeCategoryEnum = pgEnum('place_category', [
  'restaurant', 'cafe', 'bar', 'retail', 'grocery', 'service', 'landmark', 'arts', 'other',
]);
export const roleEnum = pgEnum('role', ['user', 'owner', 'moderator', 'admin']);
export const sourceKindEnum = pgEnum('source_kind', ['overture', 'osm', 'license', 'owner', 'community', 'seed']);
export const submissionStatusEnum = pgEnum('submission_status', ['pending', 'approved', 'rejected']);
export const claimStatusEnum = pgEnum('claim_status', ['pending', 'approved', 'rejected']);
export const eventSourceEnum = pgEnum('event_source', ['owner', 'park_district', 'ticketmaster', 'bandsintown', 'community']);
export const areaChangeKindEnum = pgEnum('area_change_kind', ['opened', 'closed', 'ownership_changed', 'license_renewed']);
export const layerKeyEnum = pgEnum('layer_key', [
  'expressways', 'arterials', 'transit-lines', 'transit-stations',
  'bus-routes', 'bus-stops', 'metra-lines', 'metra-stations',
]);
export const authProviderEnum = pgEnum('auth_provider', ['apple', 'google']);
