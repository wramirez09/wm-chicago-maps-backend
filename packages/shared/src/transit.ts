import { z } from 'zod';

export const ArrivalsQuery = z.object({
  stop: z.string().min(1).max(40),
  mode: z.enum(['rail', 'bus', 'metra']).default('rail'),
});
export const Arrival = z.object({
  route: z.string(),
  destination: z.string(),
  arrivesAt: z.string(),
  minutes: z.number().int(),
  live: z.boolean(),
  delayed: z.boolean(),
});
export const Arrivals = z.object({
  stop: z.string(),
  mode: z.enum(['rail', 'bus', 'metra']),
  fetchedAt: z.string(),
  arrivals: z.array(Arrival),
});

export const DivvyStation = z.object({
  id: z.string(),
  name: z.string(),
  lng: z.number(),
  lat: z.number(),
  bikes: z.number().int(),
  ebikes: z.number().int(),
  docks: z.number().int(),
  renting: z.boolean(),
});
export const DivvyStations = z.object({ fetchedAt: z.string(), stations: z.array(DivvyStation) });
