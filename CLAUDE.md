# Chicago Local Map — notes for Claude Code

- Monorepo: pnpm workspaces + Turborepo. Node 22. TypeScript strict everywhere.
- Backend is `apps/api` (Fastify 5, Drizzle + PostGIS on Supabase Postgres, pg-boss jobs). Deploys to Fly.io region `ord`.
- Mobile is `apps/mobile`: bare React Native (no Expo), `@maplibre/maplibre-react-native`. It only calls `/v1/*` on the API; Supabase is used client-side for Auth only.
- Shared request/response schemas live in `packages/shared` as zod; never hand-write duplicate interfaces.
- Upstream API keys never ship in the mobile bundle. All third-party calls go through the API.
- Do not add Mapbox, Google Maps, Yelp, or Google Places SDKs — their terms conflict with a self-hosted, community-owned dataset.
- Chicago city limits are the product boundary. Bbox: `-87.94, 41.64, -87.52, 42.02`.
- Specs for scaffolding are in `.claude/commands/`. Read the relevant one before large changes.
- Run `pnpm -r typecheck && pnpm -r lint && pnpm -r test` before declaring anything done.
