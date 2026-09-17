import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import type { buildServer as BuildServer } from '../server.js';
import type { PhotonResponse } from '../upstream/photon.js';
import type * as Http from '../lib/http.js';

/** Mocked Photon: the fetch layer, so the client's bbox filter and label rules run for real. */
const photon = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'down', lastUrl: '' }));
vi.mock('../lib/http.js', async (orig) => {
  const real = await orig<typeof Http>();
  return {
    ...real,
    fetchJson: async (url: string): Promise<PhotonResponse> => {
      photon.lastUrl = url;
      if (photon.mode === 'down') throw new real.UpstreamError('photon', 503, 'HTTP 503');
      return {
        features: [
          { geometry: { coordinates: [-87.6712712, 41.8293346] }, properties: { name: 'Nathanael Greene Elementary School', housenumber: '3525', street: 'South Honore Street', city: 'Chicago', osm_type: 'W', osm_id: 405330583, osm_key: 'amenity', osm_value: 'school' } },
          { geometry: { coordinates: [-87.6713, 41.8291] }, properties: { housenumber: '3525', street: 'South Honore Street', city: 'Chicago', osm_type: 'N', osm_id: 1 } },
          // Naperville: inside Photon's bias box tolerance but outside Chicago — must be dropped.
          { geometry: { coordinates: [-88.15, 41.78] }, properties: { name: 'Honore Street', city: 'Naperville', osm_type: 'W', osm_id: 2 } },
        ],
      };
    },
  };
});

const env = loadEnv({ DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x', JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test', LOG_LEVEL: 'fatal', PHOTON_URL: 'http://photon.test' });
let app: Awaited<ReturnType<typeof BuildServer>>;

beforeAll(async () => {
  const { buildServer } = await import('../server.js');
  app = await buildServer(env);
  await app.ready();
});
afterAll(async () => app.close());

describe('GET /v1/geocode', () => {
  it('returns a Point FeatureCollection with POI and plain-address labels, Chicago only', async () => {
    photon.mode = 'ok';
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=3525%20S%20Honore&limit=5' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    const body = res.json();
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toHaveLength(2);
    expect(body.features[0]).toEqual({
      type: 'Feature',
      id: 'W405330583',
      geometry: { type: 'Point', coordinates: [-87.6712712, 41.8293346] },
      properties: { name: 'Nathanael Greene Elementary School', label: 'Nathanael Greene Elementary School, 3525 South Honore Street, Chicago' },
    });
    expect(body.features[1].properties).toEqual({ name: null, label: '3525 South Honore Street, Chicago' });
    expect(photon.lastUrl).toContain('bbox=-87.94,41.64,-87.52,42.03');
  });

  it('rejects q shorter than 3 chars in the standard error shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=ab' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    const missing = await app.inject({ method: 'GET', url: '/v1/geocode' });
    expect(missing.statusCode).toBe(400);
  });

  it('clamps limit', async () => {
    photon.mode = 'ok';
    const one = await app.inject({ method: 'GET', url: '/v1/geocode?q=honore%20street&limit=1' });
    expect(one.json().features).toHaveLength(1);
    const tooMany = await app.inject({ method: 'GET', url: '/v1/geocode?q=honore&limit=50' });
    expect(tooMany.statusCode).toBe(400);
    const zero = await app.inject({ method: 'GET', url: '/v1/geocode?q=honore&limit=0' });
    expect(zero.statusCode).toBe(400);
  });

  it('reports Photon being down as 502 photon unavailable', async () => {
    photon.mode = 'down';
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=somewhere%20new' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ statusCode: 502, error: 'Bad Gateway', message: 'photon unavailable' });
  });
});
