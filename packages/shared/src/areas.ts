import { z } from 'zod';
import { MultiPolygonGeometry, Slug, feature, featureCollection } from './common.js';

export const AreaSummary = z.object({
  number: z.number().int().min(1).max(77),
  slug: Slug,
  name: z.string(),
  placeCount: z.number().int(),
});
export const AreaFeature = feature(MultiPolygonGeometry, AreaSummary);
export const AreaCollection = featureCollection(AreaFeature);
export type AreaCollection = z.infer<typeof AreaCollection>;

export const AreaDetail = AreaSummary.extend({
  summary: z.string().nullable(),
  imageUrl: z.string().nullable(),
  attribution: z.string().nullable(),
  boundary: MultiPolygonGeometry,
});
export type AreaDetail = z.infer<typeof AreaDetail>;

export const AreaChangeKind = z.enum(['opened', 'closed', 'ownership_changed', 'license_renewed']);
export const AreaChange = z.object({
  kind: AreaChangeKind,
  occurredAt: z.string(),
  placeId: z.string().uuid().nullable(),
  name: z.string(),
  address: z.string().nullable(),
  detail: z.string().nullable(),
});
export const AreaChangesQuery = z.object({ since: z.string().datetime({ offset: true }).optional() });
export const AreaChanges = z.object({ area: Slug, since: z.string(), changes: z.array(AreaChange) });
