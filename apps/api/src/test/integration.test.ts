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

vi.mock('../upstream/overpass.js', () => ({
  overpass: async (_env: unknown, query: string): Promise<OverpassElement[]> => {
    if (query.includes('motorway')) {
      return [{ type: 'way', id: 1, tags: { highway: 'motorway', name: 'Kennedy Expressway', ref: 'I-90' }, geometry: [{ lon: -87.65, lat: 41.9 }, { lon: -87.66, lat: 41.91 }, { lon: -87.67, lat: 41.92 }] }];
    }
    return [];
  },
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
    await db.db.delete(layerFeatures).where(eq(layerFeatures.layer, 'expressways'));
    await db.db.delete(layerRuns).where(eq(layerRuns.layer, 'expressways'));
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
