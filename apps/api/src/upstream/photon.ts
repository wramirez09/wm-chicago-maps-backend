import { CHICAGO_BBOX, type GeocodeFeature } from '@wm/shared';
import type { Env } from '../env.js';
import { fetchJson } from '../lib/http.js';

export type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    osm_id?: number;
    osm_type?: 'N' | 'W' | 'R';
    osm_key?: string;
    osm_value?: string;
  };
};
export type PhotonResponse = { features: PhotonFeature[] };

const bboxParam = CHICAGO_BBOX.join(',');

const inside = ([lng, lat]: [number, number]) =>
  lng >= CHICAGO_BBOX[0] && lng <= CHICAGO_BBOX[2] && lat >= CHICAGO_BBOX[1] && lat <= CHICAGO_BBOX[3];

/**
 * Forward geocode, Chicago only. Photon's `bbox` biases but does not strictly
 * filter, so results are re-checked here. Over-fetches slightly so filtering
 * still leaves `limit` hits.
 */
export async function geocode(env: Env, q: string, limit: number): Promise<GeocodeFeature[]> {
  const url = `${env.PHOTON_URL}/api?q=${encodeURIComponent(q)}&limit=${Math.min(limit * 2, 20)}&bbox=${bboxParam}&lang=en`;
  const data = await fetchJson<PhotonResponse>(url, { service: 'photon' });
  return data.features
    .filter((f) => inside(f.geometry.coordinates))
    .slice(0, limit)
    .map(toFeature);
}

export async function reverse(env: Env, lng: number, lat: number): Promise<GeocodeFeature | null> {
  const url = `${env.PHOTON_URL}/reverse?lon=${lng}&lat=${lat}&lang=en`;
  const data = await fetchJson<PhotonResponse>(url, { service: 'photon' });
  const f = data.features[0];
  return f ? toFeature(f) : null;
}

/**
 * Photon has no display-name field, so the label is assembled: a POI leads
 * with its name, then "housenumber street", then city; a plain address leads
 * with "housenumber street". Empty parts are skipped.
 */
export function toFeature(f: PhotonFeature): GeocodeFeature {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = p.name?.trim() || null;
  const label = [name, street, p.city].filter((s): s is string => Boolean(s && s.trim())).join(', ');
  const id = p.osm_type && p.osm_id !== undefined ? `${p.osm_type}${p.osm_id}` : undefined;
  return {
    type: 'Feature',
    ...(id ? { id } : {}),
    geometry: { type: 'Point', coordinates: [f.geometry.coordinates[0], f.geometry.coordinates[1]] },
    properties: { name, label },
  };
}
