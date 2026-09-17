import { CHICAGO_BBOX } from '@wm/shared';
import type { Env } from '../env.js';
import { fetchJson } from '../lib/http.js';

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; city?: string; osm_id: number; osm_key?: string; osm_value?: string };
};
type PhotonResponse = { features: PhotonFeature[] };

const bboxParam = CHICAGO_BBOX.join(',');

/** Photon returns hits just outside the bbox for some queries; enforce it. */
const inside = (h: { lng: number; lat: number }) =>
  h.lng >= CHICAGO_BBOX[0] && h.lng <= CHICAGO_BBOX[2] && h.lat >= CHICAGO_BBOX[1] && h.lat <= CHICAGO_BBOX[3];

export async function geocode(env: Env, q: string, limit = 10) {
  const url = `${env.PHOTON_URL}/api?q=${encodeURIComponent(q)}&limit=${limit}&bbox=${bboxParam}&lang=en`;
  const data = await fetchJson<PhotonResponse>(url, { service: 'photon' });
  return data.features.map(toHit).filter(inside).slice(0, limit);
}

export async function reverse(env: Env, lng: number, lat: number) {
  const url = `${env.PHOTON_URL}/reverse?lon=${lng}&lat=${lat}&lang=en`;
  const data = await fetchJson<PhotonResponse>(url, { service: 'photon' });
  return data.features[0] ? toHit(data.features[0]) : null;
}

function toHit(f: PhotonFeature) {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const address = [street, p.city].filter(Boolean).join(', ');
  const [lng, lat] = f.geometry.coordinates;
  return {
    id: `${p.osm_key ?? 'osm'}/${p.osm_id}`,
    name: p.name ?? street ?? 'Unnamed',
    address: address || null,
    kind: `${p.osm_key ?? ''}=${p.osm_value ?? ''}`,
    lng,
    lat,
  };
}
