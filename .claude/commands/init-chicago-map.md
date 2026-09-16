---
description: Bootstrap the Chicago local-map mobile app — bare React Native + MapLibre Native, PMTiles basemap, typed API client, Supabase Auth
argument-hint: [app-name]
---

Bootstrap a bare React Native (no Expo) TypeScript app named $ARGUMENTS (default: ChicagoLocal) at `apps/mobile` in the monorepo created by /init-chicago-api, with a MapLibre Native map as the home screen. The app talks only to the Fastify API (`API_URL`), never to Supabase tables directly; Supabase is used client-side for Auth only.

## Stack (do not substitute)

- React Native CLI, latest stable, TypeScript strict, New Architecture enabled, Hermes.
- `@maplibre/maplibre-react-native` for the map. Run the iOS pod install and Android Gradle setup it requires; do not add Mapbox or Google Maps SDKs.
- `react-native-mmkv` for local KV, `@tanstack/react-query` for server state, `zustand` for UI state, `react-native-screens` + `@react-navigation/native` (native stack + bottom tabs).
- `@supabase/supabase-js` with `react-native-url-polyfill` and MMKV-backed auth storage, used for sign-in only. The access token is sent as a Bearer header to the API via a typed client in `src/lib/api/client.ts` built on the zod schemas from `packages/shared`.
- `react-native-config` for env. `.env.example` lists every var with a one-line comment.
- Vitest is not usable in bare RN; use Jest with the RN preset. Detox is out of scope for now.

## Map

- Basemap source is a PMTiles archive at `PMTILES_URL` (Cloudflare R2). MapLibre Native does not read PMTiles directly, so serve it through a tile URL template: default to the `pmtiles` serverless worker pattern (`{PMTILES_URL}/{z}/{x}/{y}.mvt`). Document in `docs/tiles.md` how to generate `chicago.pmtiles` with Protomaps/`pmtiles extract` clipped to the Chicago city-limits bbox and how to deploy the R2 worker.
- Style: `assets/map/style.json` following the Protomaps basemap schema layers. Ship a starter Chicago theme: navy `#0B2545` water, sky `#41B6E6` transit lines, red `#E4002B` for the app's own POI layer, muted neutral land/roads. Fonts via `GLYPHS_URL`, sprites via `SPRITE_URL`. Add a `scripts/style/` README pointing to Maputnik for edits.
- Constrain the camera to the Chicago bbox (`-87.94, 41.64, -87.52, 42.02`), min zoom 9, max zoom 18, default center on the Loop.
- Add an empty GeoJSON source `places` with a symbol layer, wired to a `usePlaces(bbox)` query hook that calls `GET /v1/places?bbox=` and renders the returned FeatureCollection. Show a bottom sheet (`@gorhom/bottom-sheet`) on tap that loads `GET /v1/places/:id`.
- Offline: stub `src/lib/map/offline.ts` with MapLibre's offline pack API for the Chicago bbox behind a "Download Chicago (~[size] MB)" setting. Do not fully implement the download UI yet.

## Layout

```
src/
  app/            navigation, screens (MapHome, PlaceDetail, Neighborhood, Submit, Settings)
  components/
  lib/
    api/          client.ts + per-group hooks (populated by /add-chicago-apis)
    map/          style loading, camera bounds, offline stub
    auth.ts       Supabase Auth session → Bearer token
    device/       location + permissions wrappers (react-native-permissions, @react-native-community/geolocation)
  store/
assets/map/
docs/
```

## Finish

1. No database code in this app. Schema and migrations live in `packages/db` (owned by /init-chicago-api).
2. Both platforms build: `yarn ios` and `yarn android` on a simulator/emulator. If a native step needs a manual action (Xcode signing, Android SDK path), print it clearly instead of guessing.
3. `yarn typecheck`, `yarn lint`, `yarn test` green.
4. `apps/mobile/README.md`: how to run, `API_URL` for simulator vs device, how to regenerate tiles, and that `/add-chicago-apis` is the next command.
