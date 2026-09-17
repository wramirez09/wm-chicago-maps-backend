/**
 * Runs only when DATABASE_URL points at a migrated PostGIS database (CI does
 * this; locally: docker compose up db && pnpm --filter @wm/api migrate).
 * Exercises the real write paths: layer ingest → GET /v1/layers, auth → submit
 * → autocheck → moderator approve → place visible → vouch.
 */
import { auditLog, createDb, eq, inArray, layerFeatures, layerRuns, or, places, profiles, submissions, vouches } from '@wm/db';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import type { OverpassElement } from '../upstream/overpass.js';
import type { buildServer as BuildServer } from '../server.js';

const DB = process.env.DATABASE_URL;
const run = DB ? describe : describe.skip;

// Belmont on the Red/Brown/Purple lines, and a Metra stop on the UP-N.
const BELMONT = { lon: -87.65338, lat: 41.93975 };
const RAVENSWOOD = { lon: -87.67494, lat: 41.96905 };

vi.mock('../upstream/overpass.js', () => ({
  overpass: async (_env: unknown, query: string): Promise<OverpassElement[]> => {
    if (query.includes('motorway')) {
      return [{ type: 'way', id: 1, tags: { highway: 'motorway', name: 'Kennedy Expressway', ref: 'I-90' }, geometry: [{ lon: -87.65, lat: 41.9 }, { lon: -87.66, lat: 41.91 }, { lon: -87.67, lat: 41.92 }] }];
    }
    if (query.includes('"route"="train"')) {
      return [{
        type: 'relation', id: 20, tags: { type: 'route', route: 'train', ref: 'UP-N', operator: 'Metra', colour: '#ignored' },
        members: [{ type: 'way', ref: 21, role: '', geometry: [RAVENSWOOD, { lon: -87.6749, lat: 41.9695 }, { lon: -87.6748, lat: 41.9700 }] }],
      }];
    }
    if (query.includes('subway|light_rail')) {
      return [{
        type: 'relation', id: 10, tags: { type: 'route', route: 'subway', name: 'Red Line', operator: 'CTA' },
        members: [{ type: 'way', ref: 11, role: '', geometry: [BELMONT, { lon: -87.6534, lat: 41.9400 }, { lon: -87.6534, lat: 41.9410 }] }],
      }];
    }
    if (query.includes('"station"="subway"')) {
      return [{ type: 'node', id: 12, tags: { railway: 'station', station: 'subway', name: 'Belmont' }, ...BELMONT }];
    }
    if (query.includes('"railway"="station"')) {
      return [
        { type: 'node', id: 22, tags: { railway: 'station', name: 'Ravenswood', operator: 'Metra', 'ref:metra': 'RAVENSWOOD' }, ...RAVENSWOOD },
        { type: 'node', id: 23, tags: { railway: 'station', name: 'Chicago Union Station', operator: 'Metra' }, lon: -87.63889, lat: 41.87889 },
        { type: 'node', id: 24, tags: { railway: 'station', name: 'Not Metra', operator: 'Amtrak' }, lon: -87.64, lat: 41.88 },
      ];
    }
    return [];
  },
}));

// CTA's GIS extracts, which supply the ids the realtime trackers take.
vi.mock('../upstream/ctaGis.js', () => ({
  fetchRailStops: async () => [
    { mapId: '41320', name: 'Belmont', point: [-87.65338, 41.93975] },
    { mapId: '40060', name: 'Belmont', point: [-87.712359, 41.938132] },
  ],
  fetchBusStops: async () => [
    { stopId: '15189', name: 'Cicero & Berteau', routes: '54, 54A', point: [-87.7475, 41.95689] },
    { stopId: null, name: 'Stop With No Id', routes: '9', point: [-87.66, 41.9] },
  ],
  fetchBusRoutes: async () => [
    { route: '57', name: 'LARAMIE', parts: [[[-87.7548, 41.87293], [-87.75347, 41.87295], [-87.75284, 41.87296]]] },
  ],
}));
// The web process' sendJob would try to start pg-boss; run the autocheck inline instead.
vi.mock('../jobs/boss.js', () => ({ sendJob: async () => 'queued', startBoss: async () => null }));

const env = loadEnv({ DATABASE_URL: DB ?? 'postgres://u:p@127.0.0.1:1/x', JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
const key = new TextEncoder().encode(env.JWT_SECRET);
const token = (sub: string, role: string) =>
  new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setIssuer(env.JWT_ISSUER).setAudience('mobile').setIssuedAt().setExpirationTime('10m').sign(key);

run('integration (PostGIS)', () => {
  let app: Awaited<ReturnType<typeof BuildServer>>;
  let db: ReturnType<typeof createDb>;
  let userId: string, modId: string;

  beforeAll(async () => {
    const { buildServer } = await import('../server.js');
    app = await buildServer(env);
    await app.ready();
    db = createDb(DB!, { max: 2 });
    const [u] = await db.db.insert(profiles).values({ displayName: 'Test Neighbor' }).returning({ id: profiles.id });
    const [m] = await db.db.insert(profiles).values({ displayName: 'Test Mod', role: 'moderator' }).returning({ id: profiles.id });
    userId = u!.id; modId = m!.id;
  });
  afterAll(async () => {
    // Tear down in FK order so the test leaves the database as it found it.
    const subs = await db.db.select({ id: submissions.id, placeId: submissions.placeId }).from(submissions).where(eq(submissions.submittedBy, userId));
    const placeIds = subs.flatMap((s) => (s.placeId ? [s.placeId] : []));
    await db.db.delete(auditLog).where(or(eq(auditLog.actorId, modId), eq(auditLog.actorId, userId)));
    await db.db.delete(submissions).where(eq(submissions.submittedBy, userId));
    if (placeIds.length) {
      await db.db.delete(vouches).where(inArray(vouches.placeId, placeIds));
      await db.db.delete(places).where(inArray(places.id, placeIds));
    }
    await db.db.delete(profiles).where(inArray(profiles.id, [userId, modId]));
    const layers = ['expressways', 'transit-lines', 'transit-stations', 'bus-routes', 'bus-stops', 'metra-lines', 'metra-stations'] as const;
    await db.db.delete(layerFeatures).where(inArray(layerFeatures.layer, [...layers]));
    await db.db.delete(layerRuns).where(inArray(layerRuns.layer, [...layers]));
    await db.close();
    await app.close();
  });

  it('ingests a layer from (mocked) Overpass and serves it with an ETag', async () => {
    const { ingestLayers } = await import('../jobs/ingest/layers.js');
    await ingestLayers({ boss: null as never, db: db.db, env, log: app.log }, { only: ['expressways'] });
    const res = await app.inject({ method: 'GET', url: '/v1/layers/expressways' });
    expect(res.statusCode).toBe(200);
    const fc = res.json();
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toMatchObject({ name: 'Kennedy Expressway', localName: 'Kennedy', kind: 'motorway' });
    expect(fc.features[0].geometry.type).toBe('LineString');
    const etag = res.headers.etag as string;
    const again = await app.inject({ method: 'GET', url: '/v1/layers/expressways', headers: { 'if-none-match': etag } });
    expect(again.statusCode).toBe(304);
    const idx = await app.inject({ method: 'GET', url: '/v1/layers' });
    expect(idx.json().layers.find((l: { key: string }) => l.key === 'expressways').featureCount).toBe(1);
  });

  it('joins CTA map ids onto rail stations', async () => {
    const { ingestLayers } = await import('../jobs/ingest/layers.js');
    await ingestLayers({ boss: null as never, db: db.db, env, log: app.log }, { only: ['transit-lines', 'transit-stations'] });

    const res = await app.inject({ method: 'GET', url: '/v1/layers/transit-stations' });
    expect(res.statusCode).toBe(200);
    const belmont = res.json().features[0];
    expect(belmont.geometry.type).toBe('Point');
    // The Blue Line Belmont shares a name but sits 5 km west, so proximity has to win.
    expect(belmont.properties).toMatchObject({ name: 'Belmont', stopId: '41320' });
    expect(belmont.properties.lines).toContain('Red');
  });

  it('serves the bus layers as points and lines with Bus Tracker stop ids', async () => {
    const { ingestLayers } = await import('../jobs/ingest/layers.js');
    await ingestLayers({ boss: null as never, db: db.db, env, log: app.log }, { only: ['bus-routes', 'bus-stops'] });

    const routes = await app.inject({ method: 'GET', url: '/v1/layers/bus-routes' });
    expect(routes.statusCode).toBe(200);
    expect(routes.json().features[0].geometry.type).toBe('LineString');
    expect(routes.json().features[0].properties).toMatchObject({ route: '57', name: 'LARAMIE' });
    expect(routes.json().features[0].properties.color).toMatch(/^#[0-9a-f]{6}$/);

    const stops = await app.inject({ method: 'GET', url: '/v1/layers/bus-stops' });
    expect(stops.statusCode).toBe(200);
    const features = stops.json().features;
    expect(features).toHaveLength(2);
    // The regression this guards: every point layer used to serve null geometry.
    expect(features.every((f: { geometry: { type: string } }) => f.geometry.type === 'Point')).toBe(true);
    expect(features.find((f: { properties: { stopId: string } }) => f.properties.stopId === '15189').properties)
      .toMatchObject({ name: 'Cicero & Berteau', routes: '54, 54A' });
    expect(features.find((f: { properties: { name: string } }) => f.properties.name === 'Stop With No Id').properties.stopId).toBeNull();
  });

  it('serves Metra lines and stations with GTFS stop ids', async () => {
    const { ingestLayers } = await import('../jobs/ingest/layers.js');
    await ingestLayers({ boss: null as never, db: db.db, env, log: app.log }, { only: ['metra-lines', 'metra-stations'] });

    const lines = await app.inject({ method: 'GET', url: '/v1/layers/metra-lines' });
    expect(lines.statusCode).toBe(200);
    // The official GTFS colour, not the '#ignored' one OSM tags the relation with.
    expect(lines.json().features[0].properties).toMatchObject({ line: 'UP-N', color: '#008000' });

    const stations = await app.inject({ method: 'GET', url: '/v1/layers/metra-stations' });
    expect(stations.statusCode).toBe(200);
    const features = stations.json().features;
    // The Amtrak station in the same bbox is not Metra's, so it is left out.
    expect(features.map((f: { properties: { name: string } }) => f.properties.name).sort())
      .toEqual(['Chicago Union Station', 'Ravenswood']);
    const ravenswood = features.find((f: { properties: { name: string } }) => f.properties.name === 'Ravenswood');
    expect(ravenswood.geometry.type).toBe('Point');
    expect(ravenswood.properties).toMatchObject({ stopId: 'RAVENSWOOD', lines: 'UP-N' });
    // Union Station carries no ref:metra tag in OSM and is filled in by name.
    expect(features.find((f: { properties: { name: string } }) => f.properties.name === 'Chicago Union Station').properties.stopId).toBe('CUS');
  });

  it('submission → autocheck → approve → visible → vouch', async () => {
    const userTok = await token(userId, 'user');
    const submit = await app.inject({
      method: 'POST', url: '/v1/places', headers: { authorization: `Bearer ${userTok}` },
      payload: { name: 'Test Taqueria', category: 'restaurant', location: { type: 'Point', coordinates: [-87.7, 41.9] }, address: '1 Test St' },
    });
    expect(submit.statusCode).toBe(202);
    const { submissionId } = submit.json();

    const { moderationAutocheck } = await import('../jobs/moderation.js');
    await moderationAutocheck({ boss: null as never, db: db.db, env, log: app.log }, { submissionId });

    const modTok = await token(modId, 'moderator');
    const queue = await app.inject({ method: 'GET', url: '/v1/mod/queue', headers: { authorization: `Bearer ${modTok}` } });
    expect(queue.statusCode).toBe(200);
    const item = queue.json().items.find((i: { id: string }) => i.id === submissionId);
    expect(item.autochecks).toMatchObject({ insideChicago: true, duplicateOf: null });

    const denied = await app.inject({ method: 'POST', url: `/v1/mod/${submissionId}/approve`, headers: { authorization: `Bearer ${userTok}` }, payload: {} });
    expect(denied.statusCode).toBe(403);

    const approve = await app.inject({ method: 'POST', url: `/v1/mod/${submissionId}/approve`, headers: { authorization: `Bearer ${modTok}` }, payload: { reason: 'looks real' } });
    expect(approve.statusCode).toBe(200);
    const { placeId } = approve.json();

    const list = await app.inject({ method: 'GET', url: '/v1/places?bbox=-87.71,41.89,-87.69,41.91&category=restaurant' });
    expect(list.json().features.map((f: { properties: { id: string } }) => f.properties.id)).toContain(placeId);

    const vouch = await app.inject({ method: 'POST', url: `/v1/places/${placeId}/vouch`, headers: { authorization: `Bearer ${userTok}` } });
    expect(vouch.json()).toEqual({ placeId, vouchCount: 1, viewerHasVouched: true });
    const detail = await app.inject({ method: 'GET', url: `/v1/places/${placeId}`, headers: { authorization: `Bearer ${userTok}` } });
    expect(detail.json()).toMatchObject({ name: 'Test Taqueria', independence: 'vouched', vouchCount: 1, viewerHasVouched: true });

    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${userTok}` } });
    expect(me.json()).toMatchObject({ displayName: 'Test Neighbor', vouchCount: 1, submissionCount: 1 });

    // A second submission 10 m away should be flagged as a duplicate.
    const dupe = await app.inject({
      method: 'POST', url: '/v1/places', headers: { authorization: `Bearer ${userTok}` },
      payload: { name: 'Test Taqueria 2', category: 'restaurant', location: { type: 'Point', coordinates: [-87.7001, 41.9] } },
    });
    await moderationAutocheck({ boss: null as never, db: db.db, env, log: app.log }, { submissionId: dupe.json().submissionId });
    const q2 = await app.inject({ method: 'GET', url: '/v1/mod/queue', headers: { authorization: `Bearer ${modTok}` } });
    expect(q2.json().items.find((i: { id: string }) => i.id === dupe.json().submissionId).autochecks.duplicateOf).toBe(placeId);
  });
});
