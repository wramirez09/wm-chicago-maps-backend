# wm-chicago-maps-backend

Backend for [wm-chicago-maps](https://github.com/wramirez09/wm-chicago-maps): a Chicago-only map of independently owned places. Locally owned, locally operated.

Node 22 · TypeScript · Fastify 5 · Drizzle + PostGIS · pg-boss · Fly.io (`ord`)

## What it does

- Serves the mobile app's `/v1` API: places (bbox search, detail, community submissions, vouches), the 77 community areas and a "what changed" license-diff feed, events, transit arrivals (CTA) and Divvy availability, walking/biking routes (Valhalla), and the map overlay layers the app used to bundle.
- Owns auth: the app signs in natively with Apple or Google and exchanges the identity token for JWTs issued here. No third-party auth vendor.
- Runs the ingest jobs: OpenStreetMap overlays (ported from the app's `scripts/fetch-*.mjs`), Chicago Data Portal community areas and business licenses/owners, Ticketmaster events. Plus the moderation autocheck and the weekly digest.
- Keeps every upstream API key on the server.

OpenAPI is generated from the zod schemas and served at `/docs`.

## Layout

```
apps/api/                 Fastify service: routes, plugins, jobs, upstream clients
  src/routes/v1/          one file per resource
  src/jobs/ingest/        pg-boss handlers (layers, areas, licenses, events)
  src/upstream/           overpass, socrata, cta, divvy, valhalla, photon
packages/shared/          zod schemas + types — the API contract the mobile app imports
packages/db/              Drizzle schema, PostGIS helpers, migrations
packages/config/          tsconfig / eslint
infra/docker-compose.yml  local PostGIS (+ optional Photon/Valhalla)
infra/fly/                Photon and Valhalla Fly apps, data build guide
fly.toml                  the API's Fly app (web + worker process groups)
```

## Run locally

```sh
pnpm install
docker compose -f infra/docker-compose.yml up -d db
cp apps/api/.env.example apps/api/.env       # DATABASE_URL points at the compose db by default
pnpm -r build                                # shared + db must be built once for the api to resolve them
pnpm --filter @wm/api migrate                # applies packages/db/drizzle
pnpm --filter @wm/api seed                   # 8 landmark places
pnpm dev                                     # http://localhost:3000/docs
pnpm --filter @wm/api dev:worker             # job worker, in a second terminal
```

Run one job inline without the queue:

```sh
pnpm --filter @wm/api job:run ingest.areas
pnpm --filter @wm/api job:run ingest.layers '{"only":["transit-lines","transit-stations"]}'
```

Checks: `pnpm -r typecheck && pnpm -r lint && pnpm -r test`. The integration tests in `apps/api/src/test/integration.test.ts` run only when `DATABASE_URL` points at a migrated PostGIS database (CI provides one).

## Schema changes

Edit `packages/db/src/schema/`, then `pnpm db:generate`. Read `packages/db/drizzle/README.md` — two hand edits are needed after every generate because drizzle-kit does not understand PostGIS types. Migrations run automatically on Fly via `release_command`.

## Deploy (Fly.io, region `ord`)

First time only:

```sh
flyctl apps create chicago-api
flyctl postgres create --name chicago-db --region ord        # Fly Postgres; enable PostGIS is automatic on first migrate
flyctl postgres attach chicago-db --app chicago-api         # sets DATABASE_URL
flyctl secrets set --app chicago-api JWT_SECRET=$(openssl rand -base64 48) APPLE_BUNDLE_ID=... GOOGLE_CLIENT_IDS=... \
  CTA_TRAIN_KEY=... CTA_BUS_KEY=... TICKETMASTER_KEY=... SOCRATA_APP_TOKEN=...
# Geo services (private, reached over Flycast):
flyctl apps create chicago-photon && flyctl volumes create photon_data --app chicago-photon --region ord --size 5
flyctl apps create chicago-valhalla && flyctl volumes create valhalla_data --app chicago-valhalla --region ord --size 5
flyctl ips allocate-v6 --private --app chicago-photon
flyctl ips allocate-v6 --private --app chicago-valhalla
./infra/fly/deploy-geo.sh
```

Then build the Photon index and Valhalla tiles once per `infra/fly/build-data.md`.

Every push to `main` that touches `apps/api`, `packages`, `fly.toml` or the lockfile deploys the API via GitHub Actions (`FLY_API_TOKEN` repo secret). Manual: `pnpm fly:deploy`.

`fly postgres` (unmanaged) ships with PostGIS available; the first migration runs `CREATE EXTENSION postgis`. If you choose Fly Managed Postgres instead, enable the `postgis` and `pg_trgm` extensions in its dashboard before the first deploy.

## Mobile app contract

The app depends on `@wm/shared` for request/response types. Until this package is published, consume it as a git dependency pinned to a commit:

```json
"@wm/shared": "github:wramirez09/wm-chicago-maps-backend#main&path:packages/shared"
```

(or a workspace link during local development). Overlay layers move from bundled TypeScript to `GET /v1/layers/:key` with ETag caching — see the migration notes in `docs/mobile-migration.md`.

## License

MIT
