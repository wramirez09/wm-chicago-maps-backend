import { CHICAGO_BBOX } from '@wm/shared';
import type { Env } from '../env.js';
import { fetchJson } from '../lib/http.js';

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; city?: string; osm_id: number; osm_key?: string; osm_value?: string };
};
type PhotonResponse = { features: PhotonFeature[] };

const bboxParam = CHICAGO_BBOX.join(',');

export async function geocode(env: Env, q: string, limit = 10) {
  const url = `${env.PHOTON_URL}/api?q=${encodeURIComponent(q)}&limit=${limit}&bbox=${bboxParam}&lang=en`;
  const data = await fetchJson<PhotonResponse>(url, { service: 'photon' });
  return data.features.map(toHit);
}

export async function reverse(env: Env, lng: number, lat: number) {
  const url = `${env.PHOTON_URL}/reverse?lon=${lng}&lat=${lat}&lang=en`;
  const data = await fetchJson<PhotonResponse>(url, { service: 'photon' });
  return data.features[0] ? toHit(data.features[0]) : null;
}

function toHit(f: PhotonFeature) {
  const p = f.properties;
  const address = [p.housenumber, p.street].filter(Boolean).join(' ');
  return { name: p.name ?? address, address: address || null, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], osmId: p.osm_id, kind: `${p.osm_key ?? ''}=${p.osm_value ?? ''}` };
}
