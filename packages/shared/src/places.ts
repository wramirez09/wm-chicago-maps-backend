import { z } from 'zod';
import { BboxParam, PointGeometry, Uuid, feature, featureCollection } from './common.js';

export const Independence = z.enum(['verified', 'vouched', 'unverified', 'chain', 'excluded']);
export type Independence = z.infer<typeof Independence>;

export const PlaceCategory = z.enum([
  'restaurant', 'cafe', 'bar', 'retail', 'grocery', 'service', 'landmark', 'arts', 'other',
]);
export type PlaceCategory = z.infer<typeof PlaceCategory>;

export const PlaceSummary = z.object({
  id: Uuid,
  slug: z.string(),
  name: z.string(),
  category: PlaceCategory,
  independence: Independence,
  communityArea: z.string().nullable(),
  address: z.string().nullable(),
  vouchCount: z.number().int(),
});
export type PlaceSummary = z.infer<typeof PlaceSummary>;

export const PlaceFeature = feature(PointGeometry, PlaceSummary);
export const PlaceCollection = featureCollection(PlaceFeature);
export type PlaceCollection = z.infer<typeof PlaceCollection>;

export const PlacesQuery = z.object({
  bbox: BboxParam,
  category: PlaceCategory.optional(),
  q: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const Hours = z.record(z.string(), z.array(z.tuple([z.string(), z.string()])));

export const PlaceDetail = PlaceSummary.extend({
  description: z.string().nullable(),
  independenceReason: z.string().nullable(),
  hours: Hours.nullable(),
  hoursConfirmedAt: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  tags: z.array(z.string()),
  location: PointGeometry,
  viewerHasVouched: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlaceDetail = z.infer<typeof PlaceDetail>;

export const PlaceSubmission = z.object({
  name: z.string().min(2).max(120),
  category: PlaceCategory,
  location: PointGeometry,
  address: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  website: z.string().url().optional(),
  whyIndependent: z.string().max(500).optional(),
});
export type PlaceSubmission = z.infer<typeof PlaceSubmission>;

export const SubmissionAccepted = z.object({ submissionId: Uuid, status: z.literal('pending') });
export const VouchResult = z.object({ placeId: Uuid, vouchCount: z.number().int(), viewerHasVouched: z.boolean() });
