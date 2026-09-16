import { sql } from 'drizzle-orm';
import {
  boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { geographyMultiPolygon, geographyPoint } from '../geo.js';
import {
  areaChangeKindEnum, authProviderEnum, claimStatusEnum, eventSourceEnum, independenceEnum,
  placeCategoryEnum, roleEnum, sourceKindEnum, submissionStatusEnum,
} from './enums.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const communityAreas = pgTable(
  'community_areas',
  {
    number: integer('number').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    summary: text('summary'),
    imageUrl: text('image_url'),
    attribution: text('attribution'),
    boundary: geographyMultiPolygon('boundary').notNull(),
    ...timestamps,
  },
  (t) => [index('community_areas_boundary_gix').using('gist', t.boundary)],
);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  role: roleEnum('role').notNull().default('user'),
  homeArea: text('home_area').references(() => communityAreas.slug),
  ...timestamps,
});

export const identities = pgTable(
  'identities',
  {
    provider: authProviderEnum('provider').notNull(),
    subject: text('subject').notNull(),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.subject] })],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_profile_idx').on(t.profileId)],
);

export const places = pgTable(
  'places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    category: placeCategoryEnum('category').notNull().default('other'),
    independence: independenceEnum('independence').notNull().default('unverified'),
    independenceReason: text('independence_reason'),
    description: text('description'),
    address: text('address'),
    communityArea: text('community_area').references(() => communityAreas.slug),
    location: geographyPoint('location').notNull(),
    hours: jsonb('hours').$type<Record<string, [string, string][]>>(),
    hoursConfirmedAt: timestamp('hours_confirmed_at', { withTimezone: true }),
    website: text('website'),
    phone: text('phone'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    ownerProfileId: uuid('owner_profile_id').references(() => profiles.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('places_location_gix').using('gist', t.location),
    index('places_area_idx').on(t.communityArea),
    index('places_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);

export const placeSources = pgTable(
  'place_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    placeId: uuid('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
    kind: sourceKindEnum('kind').notNull(),
    externalId: text('external_id').notNull(),
    raw: jsonb('raw').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('place_sources_kind_ext_uidx').on(t.kind, t.externalId), index('place_sources_place_idx').on(t.placeId)],
);

export const licenses = pgTable(
  'licenses',
  {
    licenseId: text('license_id').primaryKey(),
    accountNumber: text('account_number').notNull(),
    siteNumber: integer('site_number').notNull(),
    legalName: text('legal_name').notNull(),
    doingBusinessAs: text('doing_business_as'),
    address: text('address'),
    licenseDescription: text('license_description'),
    status: text('status'),
    startDate: timestamp('start_date', { withTimezone: true }),
    expirationDate: timestamp('expiration_date', { withTimezone: true }),
    communityArea: text('community_area'),
    location: geographyPoint('location'),
    placeId: uuid('place_id').references(() => places.id),
    raw: jsonb('raw').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('licenses_account_idx').on(t.accountNumber), index('licenses_location_gix').using('gist', t.location)],
);

export const owners = pgTable(
  'owners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountNumber: text('account_number').notNull(),
    ownerFirstName: text('owner_first_name'),
    ownerLastName: text('owner_last_name'),
    legalEntityOwner: text('legal_entity_owner'),
    title: text('title'),
    raw: jsonb('raw').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('owners_account_idx').on(t.accountNumber),
    uniqueIndex('owners_identity_uidx').on(t.accountNumber, t.ownerFirstName, t.ownerLastName, t.legalEntityOwner),
  ],
);

export const areaChanges = pgTable(
  'area_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityArea: text('community_area').notNull().references(() => communityAreas.slug),
    kind: areaChangeKindEnum('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    placeId: uuid('place_id').references(() => places.id),
    licenseId: text('license_id'),
    name: text('name').notNull(),
    address: text('address'),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('area_changes_area_time_idx').on(t.communityArea, t.occurredAt)],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    venueName: text('venue_name'),
    placeId: uuid('place_id').references(() => places.id),
    location: geographyPoint('location').notNull(),
    source: eventSourceEnum('source').notNull(),
    externalId: text('external_id'),
    url: text('url'),
    free: boolean('free'),
    raw: jsonb('raw'),
    ...timestamps,
  },
  (t) => [
    index('events_location_gix').using('gist', t.location),
    index('events_starts_idx').on(t.startsAt),
    uniqueIndex('events_source_ext_uidx').on(t.source, t.externalId),
  ],
);

export const vouches = pgTable(
  'vouches',
  {
    placeId: uuid('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.profileId] })],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submittedBy: uuid('submitted_by').notNull().references(() => profiles.id),
    status: submissionStatusEnum('status').notNull().default('pending'),
    payload: jsonb('payload').notNull(),
    location: geographyPoint('location').notNull(),
    autochecks: jsonb('autochecks'),
    decidedBy: uuid('decided_by').references(() => profiles.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionReason: text('decision_reason'),
    placeId: uuid('place_id').references(() => places.id),
    ...timestamps,
  },
  (t) => [index('submissions_status_idx').on(t.status, t.createdAt), index('submissions_location_gix').using('gist', t.location)],
);

export const claims = pgTable('claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: uuid('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  status: claimStatusEnum('status').notNull().default('pending'),
  evidence: text('evidence'),
  decidedBy: uuid('decided_by').references(() => profiles.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  ...timestamps,
});

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    pushToken: text('push_token').notNull().unique(),
    homeArea: text('home_area'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('devices_profile_idx').on(t.profileId)],
);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => profiles.id),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cache = pgTable('cache', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
