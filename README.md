# wm-chicago-maps-backend

Backend for [wm-chicago-maps](https://github.com/wramirez09/wm-chicago-maps): a Chicago-only map of independently owned places. Locally owned, locally operated.

Node 22 · TypeScript · Fastify 5 · Drizzle + PostGIS · pg-boss · Docker · Fly.io (`ord`)

The backend is containerized end to end: one image (`apps/api/Dockerfile`) is what you
run locally under Compose, what CI builds, and what Fly deploys. Node, pnpm and the
migrations are pinned inside it, so the host only needs Docker.

## What it does

- Serves the mobile app's `/v1` API: places (bbox search, detail, community submissions, vouches), the 77 community areas and a "what changed" license-diff feed, events, transit arrivals (CTA) and Divvy availability, walking/biking routes (Valhalla), address search (Photon), and the map overlay layers the app used to bundle.
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
apps/api/Dockerfile       the one image: api, worker, migrations, seed, job runner
infra/docker-compose.yml  the whole stack locally (+ optional Photon/Valhalla)
infra/fly/                Photon and Valhalla Fly apps, data build guide
fly.toml                  the API's Fly app (web + worker process groups)
```

## Run locally

Docker is the only prerequisite. Compose brings up the whole backend — PostGIS →
migrations → API on :3000 → worker — from the same image Fly runs:

```sh
cp apps/api/.env.example apps/api/.env       # optional; upstream keys only
docker compose -f infra/docker-compose.yml up --build
open http://localhost:3000/docs
```

Compose reads `apps/api/.env` if it exists; `DATABASE_URL`, `JWT_SECRET` and the
geo URLs already have working local defaults in `infra/docker-compose.yml`, so
the file is only needed for upstream keys.

Seed and backfill by running one-off containers against the same image — no
host Node, no host build:

```sh
C="docker compose -f infra/docker-compose.yml"
$C run --rm api node dist/seed.js                       # 8 landmark places
$C run --rm api node dist/jobs/run.js ingest.areas      # 77 community areas
$C run --rm api node dist/jobs/run.js ingest.layers '{"only":["transit-lines","transit-stations"]}'
```

`scripts/load-data.command` does the seed + areas + layers sequence in one go
(double-click it in Finder).

Everyday container commands:

```sh
$C ps                       # what's up
$C logs -f api worker       # tail both
$C exec api sh              # shell in the running api
$C run --rm migrate         # re-apply migrations
$C down                     # stop;  add -v to drop the pgdata volume too
$C --profile geo up photon valhalla   # self-hosted geo, after infra/fly/build-data.md
```

### Hot-reloading (optional)

Only if you want `tsx watch` on file save. This is the one path that needs Node
on the host, and it must be Node 22 to match the image (`.nvmrc`):

```sh
pnpm install
docker compose -f infra/docker-compose.yml up -d db   # just PostGIS
cp apps/api/.env.example apps/api/.env                # DATABASE_URL points at the compose db
pnpm -r build                                         # shared + db must be built once
pnpm --filter @wm/api migrate
pnpm --filter @wm/api seed
pnpm dev                                              # http://localhost:3000/docs
pnpm --filter @wm/api dev:worker                      # second terminal
```

Host `pnpm` scripts run TypeScript through `tsx`; their in-container twins run
the compiled `dist/` build. Both are listed in `apps/api/package.json`. Anything
that must be runnable in production needs an entry in `apps/api/tsup.config.ts`
— the image ships `dist/` and production dependencies only, with no `tsx` and no
`src/`.

## Overlay layers

`GET /v1/layers` lists them; `GET /v1/layers/:key` serves one as a GeoJSON
FeatureCollection with an ETag. All eight are written by `ingest.layers`
(weekly), each as a new run that is flipped to `current` when it is complete.

| Key | Geometry | Properties | Source |
| --- | --- | --- | --- |
| `expressways` | LineString | `name`, `ref`, `kind`, `localName` | OSM |
| `arterials` | LineString | `name`, `kind` | OSM |
| `transit-lines` | LineString | `line`, `color` | OSM, official CTA colours |
| `transit-stations` | Point | `name`, `lines`, `stopId` | OSM geometry; `stopId` is the CTA Train Tracker `mapid` joined from the city's ['L'](https://data.cityofchicago.org/d/8pix-ypme) stop list |
| `bus-routes` | LineString | `route`, `name`, `color` | [CTA - Bus Routes](https://data.cityofchicago.org/d/6uva-a5ei) |
| `bus-stops` | Point | `name`, `stopId`, `routes` | [CTA_BusStops](https://data.cityofchicago.org/d/qs84-j7wh); `stopId` is the Bus Tracker `stpid` |
| `metra-lines` | LineString | `line`, `color` | OSM relations, official colours from Metra's GTFS |
| `metra-stations` | Point | `name`, `stopId`, `lines` | OSM; `stopId` is the Metra GTFS `stop_id` from the `ref:metra` tag |

`stopId` is nullable everywhere it appears, and feeds
`GET /v1/transit/arrivals?stop=&mode=`. Rail and bus arrivals need
`CTA_TRAIN_KEY` and `CTA_BUS_KEY`; without them that endpoint returns 502.
Metra arrivals are not implemented yet and return 400.

`bus-stops` is by far the largest layer — about 10,000 points, roughly 2 MB of
JSON — and no response compression is configured, so it goes over the wire
uncompressed. Clients should rely on the ETag and the 24 h `cache-control`.

Checks: `pnpm -r typecheck && pnpm -r lint && pnpm -r test`. The integration tests in `apps/api/src/test/integration.test.ts` run only when `DATABASE_URL` points at a migrated PostGIS database (CI provides one).

## Schema changes

Edit `packages/db/src/schema/`, then `pnpm db:generate`. Read `packages/db/drizzle/README.md` — two hand edits are needed after every generate because drizzle-kit does not understand PostGIS types.

Migrations are baked into the image (`/app/drizzle`) and applied by `node dist/migrate.js`: the `migrate` service on `docker compose up` locally, and Fly's `release_command` in production. A migration that fails in the release machine aborts the deploy.

## Deploy (Fly.io, region `ord`)

Fly builds `apps/api/Dockerfile` and runs the resulting image as two process
groups from one `fly.toml`: `web` (`node dist/index.js`, behind the health check
on `/v1/ready`) and `worker` (`node dist/worker.js`). Migrations are not a
deploy step you run — `release_command = "node dist/migrate.js"` runs them in a
release machine built from the same image, and a failure there aborts the
rollout before any traffic shifts.

### Preflight

Verify the artifact locally before touching Fly — this is the exact image Fly
will run:

```sh
pnpm -r typecheck && pnpm -r lint && pnpm -r test
docker build -f apps/api/Dockerfile -t chicago-api:preflight .
docker run --rm --entrypoint ls chicago-api:preflight -R /app/dist   # index, worker, migrate, seed, jobs/run
docker compose -f infra/docker-compose.yml up --build                # full stack, /v1/ready green
```

### First time only

```sh
flyctl apps create chicago-api
flyctl postgres create --name chicago-db --region ord        # unmanaged Fly Postgres; PostGIS is available
flyctl postgres attach chicago-db --app chicago-api          # sets DATABASE_URL
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

**Postgres flavour matters.** Unmanaged `fly postgres` ships with PostGIS
available and the first migration runs `CREATE EXTENSION postgis` itself. Fly
Managed Postgres does not let the app create extensions — enable `postgis` and
`pg_trgm` from its dashboard *before* the first deploy, or the release command
fails and the deploy rolls back.

`JWT_SECRET` must be at least 32 characters or the process exits at boot
(`apps/api/src/env.ts` parses the environment once and hard-fails). Set every
secret before the first deploy, since the release machine boots the same code.

### Deploying

Every push to `main` touching `apps/api`, `packages`, `fly.toml` or the lockfile
deploys via GitHub Actions (`FLY_API_TOKEN` repo secret). Manual:

```sh
pnpm fly:deploy        # flyctl deploy --remote-only — builds the image on Fly's builder
pnpm fly:logs
pnpm fly:ssh
```

Post-deploy, one-off container tasks run against the deployed image:

```sh
flyctl ssh console --app chicago-api -C "node /app/dist/seed.js"
flyctl ssh console --app chicago-api -C "node /app/dist/jobs/run.js ingest.areas"
flyctl ssh console --app chicago-api -C "node /app/dist/jobs/run.js ingest.layers"
flyctl status --app chicago-api
flyctl releases --app chicago-api          # roll back with: flyctl deploy --image <previous>
```

The worker process group has no public address; scale it independently with
`flyctl scale count worker=1 --app chicago-api`.

## Mobile app contract

The app depends on `@wm/shared` for request/response types. Until this package is published, consume it as a git dependency pinned to a commit:

```json
"@wm/shared": "github:wramirez09/wm-chicago-maps-backend#main&path:packages/shared"
```

(or a workspace link during local development). Overlay layers move from bundled TypeScript to `GET /v1/layers/:key` with ETag caching — see the migration notes in `docs/mobile-migration.md`.

## License

MIT
