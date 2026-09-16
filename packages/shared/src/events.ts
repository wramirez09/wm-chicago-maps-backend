import { z } from 'zod';
import { BboxParam, PointGeometry, Uuid, feature, featureCollection } from './common.js';

export const EventSource = z.enum(['owner', 'park_district', 'ticketmaster', 'bandsintown', 'community']);
export const EventSummary = z.object({
  id: Uuid,
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  venueName: z.string().nullable(),
  placeId: Uuid.nullable(),
  source: EventSource,
  url: z.string().nullable(),
  free: z.boolean().nullable(),
});
export const EventFeature = feature(PointGeometry, EventSummary);
export const EventCollection = featureCollection(EventFeature);
export const EventsQuery = z.object({
  bbox: BboxParam,
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
