import type { Env } from '../env.js';
import { fetchJson } from '../lib/http.js';

const COSTING = { walk: 'pedestrian', bike: 'bicycle', transit: 'multimodal' } as const;

type ValhallaResponse = {
  trip: {
    summary: { length: number; time: number };
    legs: { shape: string; summary: { length: number; time: number }; maneuvers: { instruction: string; travel_mode?: string }[] }[];
  };
};

export async function route(env: Env, from: [number, number], to: [number, number], mode: keyof typeof COSTING) {
  const body = {
    locations: [{ lon: from[0], lat: from[1] }, { lon: to[0], lat: to[1] }],
    costing: COSTING[mode],
    units: 'kilometers',
    directions_options: { language: 'en-US' },
  };
  const data = await fetchJson<ValhallaResponse>(`${env.VALHALLA_URL}/route`, {
    service: 'valhalla',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 15_000,
  });
  const coords = data.trip.legs.flatMap((l) => decodePolyline6(l.shape));
  return {
    mode,
    distanceMeters: Math.round(data.trip.summary.length * 1000),
    durationSeconds: Math.round(data.trip.summary.time),
    geometry: { type: 'LineString' as const, coordinates: coords },
    legs: data.trip.legs.map((l) => ({
      mode: l.maneuvers[0]?.travel_mode ?? COSTING[mode],
      distanceMeters: Math.round(l.summary.length * 1000),
      durationSeconds: Math.round(l.summary.time),
      instructions: l.maneuvers.map((m) => m.instruction),
    })),
  };
}

/** Valhalla encodes shapes as Google polylines at 1e6 precision. */
export function decodePolyline6(str: string): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const out: [number, number][] = [];
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}
