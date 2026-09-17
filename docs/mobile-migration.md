# Moving the mobile app onto this backend

What was reviewed in `wramirez09/wm-chicago-maps` (5 commits, RN 0.87, MapLibre RN 11, OpenFreeMap Liberty basemap) and where each piece now lives.

| In the app today | Backend equivalent | App change |
| --- | --- | --- |
| `src/data/expressways.ts` (360 KB generated) | `GET /v1/layers/expressways` | Fetch once, cache with ETag (`if-none-match`), keep `ExpresswayOverlay` as is — same feature properties |
| `src/data/arterials.ts` (556 KB generated) | `GET /v1/layers/arterials` | same |
| `src/data/transit.ts` (249 KB generated) | `GET /v1/layers/transit-lines`, `GET /v1/layers/transit-stations` | `TransitOverlay` reads two collections instead of one module |
| `scripts/fetch-*.mjs` | `apps/api/src/jobs/ingest/layers.ts` (weekly cron) | Delete the scripts |
| `src/data/landmarks.ts` | `places` rows (`category=landmark`), `GET /v1/places?bbox=&category=landmark` | `LandmarkOverlay` becomes the generic places layer |
| `src/config/map.ts` bbox / center | `CHICAGO_BBOX`, `CHICAGO_CENTER` in `@wm/shared` | Import instead of redefining |
| `LayerKey`, feature property types | zod schemas in `@wm/shared/layers` | `z.infer` replaces hand-written types |
| Search: street addresses (never worked — local index only) | `GET /v1/geocode?q=&limit=` (Photon, Chicago bbox) → Point FeatureCollection `{name, label}` | `SearchBar` merges geocode features under local results; min 3 chars |
| — | `POST /v1/auth/native` | Add Sign in with Apple / Google (native), send identity token, store the JWT pair |
| — | `POST /v1/places`, `/vouch` | Submit and vouch screens |

Keep in the app: `MapScreen`, the overlay components, `FeatureCard`, `LayerToggle`, the OpenFreeMap style URL (free, no key — fine until self-hosted PMTiles is worth the effort).

Suggested order: (1) add a typed API client built on `@wm/shared`; (2) swap the three generated modules for `/v1/layers` with an on-disk cache (MMKV) and ETag revalidation — this removes ~1.1 MB from the JS bundle; (3) replace landmarks with `/v1/places`; (4) auth, then submit/vouch.
