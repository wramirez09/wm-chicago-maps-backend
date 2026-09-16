import { z } from 'zod';

/** Chicago city limits with a little breathing room: [west, south, east, north]. */
export const CHICAGO_BBOX = [-87.94, 41.64, -87.52, 42.03] as const;
export const CHICAGO_CENTER = [-87.6298, 41.8781] as const;

export const Lng = z.number().min(-180).max(180);
export const Lat = z.number().min(-90).max(90);
export const LngLat = z.tuple([Lng, Lat]);
export type LngLat = z.infer<typeof LngLat>;

/** "west,south,east,north" query-string form, validated and clamped to Chicago. */
export const BboxParam = z
  .string()
  .transform((s, ctx) => {
    const parts = s.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox must be west,south,east,north' });
      return z.NEVER;
    }
    const [w, s_, e, n] = parts as [number, number, number, number];
    if (w >= e || s_ >= n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox is inverted' });
      return z.NEVER;
    }
    return {
      west: Math.max(w, CHICAGO_BBOX[0]),
      south: Math.max(s_, CHICAGO_BBOX[1]),
      east: Math.min(e, CHICAGO_BBOX[2]),
      north: Math.min(n, CHICAGO_BBOX[3]),
    };
  });
export type Bbox = z.output<typeof BboxParam>;

export const PointGeometry = z.object({ type: z.literal('Point'), coordinates: LngLat });
export const LineStringGeometry = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(LngLat).min(2),
});
export const MultiPolygonGeometry = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(LngLat))),
});

export const feature = <G extends z.ZodTypeAny, P extends z.ZodTypeAny>(geometry: G, properties: P) =>
  z.object({ type: z.literal('Feature'), id: z.union([z.string(), z.number()]).optional(), geometry, properties });

export const featureCollection = <F extends z.ZodTypeAny>(f: F) =>
  z.object({ type: z.literal('FeatureCollection'), features: z.array(f) });

export const Slug = z.string().regex(/^[a-z0-9-]+$/);
export const Uuid = z.string().uuid();
export const IsoDate = z.string().datetime({ offset: true });

export const ErrorResponse = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});
