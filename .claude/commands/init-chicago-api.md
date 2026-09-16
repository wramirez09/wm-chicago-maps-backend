---
description: (Historical) The spec this backend was scaffolded from. The code is the source of truth now; keep for context.
---

> Superseded by the implementation. Differences from this spec: no Supabase (Fly Postgres + our own JWT auth), no apps/mobile in this repo, migrations run via a bundled `dist/migrate.js`.


Create the backend for the Chicago local-map app as a pnpm + Turborepo monorepo. If `apps/mobile` (from /init-chicago-map) already exists at the repo root, move it into the monorepo without changing its contents.

## Layout

```
apps/
  api/          Fastify service (this command)
  mobile/       bare React Native app (from /init-chicago-map)
  admin/        (empty placeholder — /add-admin later)
packages/
  shared/       zod schemas + inferred TS types shared by api, mobile, admin
  db/           Drizzle schema, migrations, seed, PostGIS helpers
  config/       shared tsconfig, eslint, prettier
```

## Stack (do not substitute)

- Node 22 LTS, TypeScript strict, ESM, `tsx` for dev, `tsup` for build.
- **Fastify 5** with `@fastify/type-provider-zod`, `@fastify/swagger` + `@fastify/swagger-ui` (OpenAPI generated from the zod schemas, served at `/docs`), `@fastify/cors`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/under-pressure`.
- **Drizzle ORM** over `postgres` (porsager) against the Supabase Postgres database. PostGIS columns via `customType` (`geography(Point,4326)`, `geography(MultiPolygon,4326)`) with helpers for `ST_DWithin`, `ST_Intersects`, `ST_AsGeoJSON`. Migrations with `drizzle-kit`; this replaces `supabase/migrations`.
- **Auth**: keep Supabase Auth. The API verifies Supabase JWTs with `jose` against the project's JWKS and puts `{ userId, role }` on the request. Roles: `user`, `owner`, `moderator`, `admin` stored in a `profiles` table, not in JWT claims.
- **Jobs**: `pg-boss` (Postgres-backed, no Redis). Queues: `ingest.licenses`, `ingest.overture`, `ingest.gtfs`, `ingest.events`, `moderation.autocheck`, `notify.digest`. Cron schedules defined in code. Job handlers live in `apps/api/src/jobs/`.
- **Validation** everywhere with zod from `packages/shared`; never hand-written interfaces for request/response shapes.
- **Logging** with pino (Fastify default), request IDs, and Sentry (`@sentry/node`).
- **HTTP client** for upstream APIs: `undici` `fetch` wrapped in `src/lib/http.ts` (timeout, retry once on 5xx, typed error). Upstream clients live in `apps/api/src/upstream/<service>.ts` — this is where /add-chicago-apis now puts them instead of the mobile app.
- **Tests**: Vitest. Unit tests mock `fetch`; integration tests run against a Postgres + PostGIS container via Testcontainers. `pnpm test` must not need network.
- **Config**: `dotenv` + zod-validated `env.ts` that fails fast on boot. `.env.example` lists every var with a one-line comment.

## Routes (v1, all under `/v1`)

- `GET /places?bbox=&category=&q=` — bbox-limited, max 500, returns GeoJSON FeatureCollection. `q` goes to Photon then filters to Chicago bbox.
- `GET /places/:id` — detail with ownership badge, hours, vouches count, transit nearby.
- `POST /places` (auth) — community submission → `moderation.autocheck` job → pending.
- `POST /places/:id/vouch` (auth), `DELETE /places/:id/vouch`.
- `GET /areas`, `GET /areas/:slug` — the 77 community areas with boundary GeoJSON and summary.
- `GET /areas/:slug/changes?since=` — license-diff digest (openings, closures, ownership changes).
- `GET /events?bbox=&from=&to=`.
- `GET /transit/arrivals?stop=` — proxies CTA/Metra with a 30s cache; keys never leave the server.
- `GET /route?from=&to=&mode=` — proxies Valhalla.
- `GET /me`, `PATCH /me` (auth). Owner claim flow: `POST /places/:id/claim` (auth) → moderator approves.
- Moderator: `GET /mod/queue`, `POST /mod/:submissionId/approve|reject` (role moderator+).
- `GET /health`, `GET /ready`.

## Data model (packages/db)

`places`, `place_sources` (one row per upstream record that fed a place: overture, osm, license, owner), `owners` (from Business Owners dataset, linked to license accounts), `licenses`, `community_areas`, `events`, `vouches`, `submissions`, `claims`, `profiles`, `devices` (push tokens), `audit_log`. GIST indexes on every geography column. `places.independence` is an enum `verified | vouched | unverified | chain | excluded` with a `independence_reason` text.

## Deploy (Fly.io, region `ord`)

- One Fly app per service, all in `ord`: `chicago-api`, `chicago-photon`, `chicago-valhalla`. Config lives in `infra/fly/<app>/fly.toml` plus each service's Dockerfile.
- **API image**: multi-stage Dockerfile, `node:22-slim` runtime, `pnpm deploy --filter api --prod` to get a minimal `node_modules`. Non-root user.
- **Process groups** in `chicago-api`: `web` (Fastify, `internal_port` 3000, `auto_stop_machines = "suspend"`, `min_machines_running = 1`) and `worker` (pg-boss handlers only, no HTTP, 1 machine, never auto-stopped). Same image, different `CMD`.
- **Health**: `http_service.checks` hitting `GET /ready` (checks DB and pg-boss). `GET /health` stays unauthenticated for uptime monitors.
- **Secrets** via `fly secrets set`; `env.ts` validation must fail the release if one is missing. `release_command = "pnpm --filter db migrate"` runs Drizzle migrations before the new version takes traffic.
- **Private networking**: API reaches Photon and Valhalla over Flycast (`http://chicago-photon.flycast`, `http://chicago-valhalla.flycast`); neither exposes a public IP. `PHOTON_URL` / `VALHALLA_URL` default to those addresses.
- **Volumes**: `chicago-photon` and `chicago-valhalla` each mount a volume for their index/tiles. Add `infra/fly/build-data.md` describing the one-time jobs that build the Chicago Photon index and Valhalla tiles from the OSM extract and copy them onto the volumes (`fly ssh sftp` or a build machine).
- **Sizing defaults**: api `shared-cpu-1x` 512 MB, worker `shared-cpu-1x` 512 MB, photon `shared-cpu-2x` 2 GB, valhalla `shared-cpu-2x` 2 GB. Note in the README that these are starting points.
- **Supabase**: create the project in the AWS `us-east-2` (Ohio) region — closest to `ord`. Use the pooled (Supavisor, transaction mode) connection string for the API and the direct string for migrations.
- **Local dev**: `infra/docker-compose.yml` runs api + worker + photon + valhalla + a PostGIS container so the whole stack works offline with `docker compose up`.
- **CI (GitHub Actions)**: `ci.yml` on PRs — lint, typecheck, test with a PostGIS service container. `deploy.yml` on `main` — build and `flyctl deploy --remote-only` for `chicago-api`; Photon and Valhalla deploy manually via `infra/fly/deploy-geo.sh` since they rarely change. `FLY_API_TOKEN` as a repo secret.
- Add `pnpm fly:logs`, `pnpm fly:ssh`, and `pnpm fly:deploy` scripts at the root.

## Finish

1. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` green; `pnpm --filter api dev` serves `/docs`.
2. `packages/shared` exports every route's request/response schema; `apps/mobile` must compile against it (add it as a workspace dependency).
3. README at repo root: architecture, how to run everything locally with `docker compose up`, env vars, first-time Fly setup (`fly launch` per app, volumes, secrets, Flycast), and the command order: `/init-chicago-api` → `/init-chicago-map` → `/add-chicago-apis <group>`.
