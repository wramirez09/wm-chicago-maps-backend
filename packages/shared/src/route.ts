import { z } from 'zod';
import { LineStringGeometry } from './common.js';

const lngLatString = z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'expected lng,lat');
export const RouteQuery = z.object({
  from: lngLatString,
  to: lngLatString,
  mode: z.enum(['walk', 'bike', 'transit']).default('walk'),
});
export const RouteLeg = z.object({
  mode: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  instructions: z.array(z.string()),
});
export const RouteResult = z.object({
  mode: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  geometry: LineStringGeometry,
  legs: z.array(RouteLeg),
});
