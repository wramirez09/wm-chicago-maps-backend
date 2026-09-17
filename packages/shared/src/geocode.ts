import { z } from 'zod';

/**
 * Address / place-name search proxied to Photon, bbox-locked to Chicago.
 * Complements the app's local index (streets, stations, landmarks), which
 * cannot resolve street addresses like "1060 W Addison".
 */
export const GeocodeQuery = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const GeocodeHit = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  /** e.g. "highway=residential", "amenity=cafe" — OSM key=value */
  kind: z.string(),
  lng: z.number(),
  lat: z.number(),
});
export type GeocodeHit = z.infer<typeof GeocodeHit>;

export const GeocodeResults = z.object({
  q: z.string(),
  hits: z.array(GeocodeHit),
  attribution: z.string(),
});
