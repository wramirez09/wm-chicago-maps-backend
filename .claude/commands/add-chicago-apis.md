---
description: Add upstream API integrations to the Chicago local-map backend (city data, transit, places, events) and the matching mobile hooks
argument-hint: [group: all | places | neighborhoods | transit | events | plumbing]
---

Add upstream integrations for group: $ARGUMENTS (default: all) to this monorepo (created by /init-chicago-api and /init-chicago-map).

## Ground rules

- **All upstream calls live in the API**, in `apps/api/src/upstream/<group>/<service>.ts`. The mobile app never calls a third-party API directly; it calls `/v1/*` routes. Keys stay on the server.
- Every upstream client uses `apps/api/src/lib/http.ts` (undici fetch, timeout, retry once on 5xx, typed error). No third-party SDKs unless a service has no plain REST API. Cache upstream responses in-process with `lru-cache` (TTL per service below) and, for shared state across instances, in a `cache` Postgres table.
- Request/response shapes are zod schemas in `packages/shared/src/<group>.ts`; the API validates upstream responses against them at the boundary so a silent upstream change fails loudly.
- Bulk ingest goes in `apps/api/src/jobs/ingest/<service>.ts` as a `pg-boss` handler with a cron schedule; expose `pnpm --filter api job:run <name>` for manual runs.
- Every new env var goes in `apps/api/.env.example` with a one-line comment on where to get the key.
- For each `/v1` route touched, add or update the TanStack Query hook in `apps/mobile/src/lib/api/<group>/hooks.ts` using the shared schema types. `staleTime`: static datasets 24h, live arrivals 30s, GBFS 60s, weather 10m.
- Tests: Vitest in `apps/api` with recorded fixtures in `src/upstream/__fixtures__/`; mock `fetch`, never hit the network. Jest in `apps/mobile` for hooks.
- Do not invent endpoints. If unsure of a URL, parameter, or field name, look up the current docs first and cite the doc URL in a comment at the top of the file.

## Services by group

### places
- **Chicago Data Portal (Socrata SODA API)** — `data.cityofchicago.org`. Clients for Business Licenses (current active), Business Owners, Community Areas boundaries (GeoJSON). Support `$where` bbox filters and `$limit`/`$offset` pagination. Nightly ingest job diffs licenses into `licenses` and writes change rows that feed `GET /areas/:slug/changes`.
- **Cook County Open Data (Socrata)** — assessor parcel lookup by PIN and address; used by the independence classifier to check whether a business owns its building.
- **Overture Maps Places** — ingest job downloads the Chicago bbox extract, keeps rows with null `brand` as independent candidates, flags the rest, upserts into `place_sources`.
- **OpenStreetMap Overpass** — POI pull for the Chicago relation as a diff source; ingest only, respect rate limits.
- **Google Business Profile API** — owner-consented sync only. OAuth routes under `/v1/owner/google/*`; no mobile UI yet.
- **Photon** — self-hosted at `PHOTON_URL`, bbox-locked to Chicago; backs `GET /places?q=` and reverse geocoding for submissions.

### neighborhoods
- **Chicago Data Portal** — Wards, Parks, Landmarks, ZIP boundaries (GeoJSON); reuse the Socrata client.
- **Chicago Park District** — events and facilities feed.
- **Wikipedia / Wikidata REST** — summary and lead image per community area; store in `community_areas` with attribution.

### transit
- **CTA Train Tracker API** — arrivals by `mapid`/`stpid`, `CTA_TRAIN_KEY`. Cache 30s.
- **CTA Bus Tracker API v2** — predictions by stop, vehicles by route, `CTA_BUS_KEY`. Cache 30s.
- **CTA GTFS static** — ingest job parses stops/routes into `transit_stops` / `transit_routes`.
- **Divvy GBFS** — `station_information.json` + `station_status.json`, no key. Cache 60s.
- **Metra GTFS + GTFS-Realtime** — basic-auth key; decode protobuf with `gtfs-realtime-bindings`.
- **Valhalla** — self-hosted at `VALHALLA_URL`: `route` (pedestrian, bicycle, multimodal) and `isochrone`; backs `GET /route`.

### events
- **Ticketmaster Discovery API** — events by lat/long + radius, `TICKETMASTER_KEY`. Ingest hourly into `events`.
- **Bandsintown** — events by location, `BANDSINTOWN_APP_ID`.
- **Eventbrite** — organizer-owned events only via OAuth under `/v1/owner/eventbrite/*`; no public search exists.

### plumbing
- **Push** — API side: `POST /v1/devices` stores FCM tokens; `notify.digest` job sends the weekly neighborhood digest via `firebase-admin`. Mobile side: `@react-native-firebase/messaging` registration; document native setup, don't fake it.
- **Location** — mobile only: `@react-native-community/geolocation` + `react-native-permissions` wrapper in `apps/mobile/src/lib/device/location.ts`.
- **Open-Meteo** — current conditions for the events feed, no key, cache 10m; exposed as `GET /v1/weather`.
- **Sentry** — `@sentry/node` in api (already from init), `@sentry/react-native` in mobile. **PostHog** — `posthog-node` server events for submissions/vouches, `posthog-react-native` client events.

## Finish

1. Update the root `README.md` table: service, purpose, key source, cache TTL, ingest schedule.
2. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` green; `/docs` shows every new route.
3. Print a summary of files created and any endpoint you could not verify.
