# Chicago Local Map — notes for Claude Code

- Monorepo: pnpm workspaces + Turborepo. Node 22. TypeScript strict everywhere.
- This repo is the backend only: `apps/api` (Fastify 5, Drizzle + PostGIS on Fly Postgres, pg-boss jobs). Deploys to Fly.io region `ord`. The mobile app lives in `wramirez09/wm-chicago-maps` and only calls `/v1/*`.
- Containerized end to end. `apps/api/Dockerfile` builds the single image used by docker-compose, CI and Fly; `infra/docker-compose.yml` runs the whole stack (db → migrate → api → worker). Prefer `docker compose -f infra/docker-compose.yml ...` over host commands when showing someone how to run things.
- The runtime image ships `dist/` plus production dependencies only — no `tsx`, no `src/`. Any script that must run in production (seed, job runner, migrate) needs an entry in `apps/api/tsup.config.ts` and is invoked as `node dist/<name>.js`. Host `pnpm` scripts that shell out to `tsx` are dev-only.
- Migrations are not a separate deploy step: `release_command = "node dist/migrate.js"` in `fly.toml` runs them from the same image, and a failure aborts the rollout.
- Auth is owned by this API (native Apple/Google identity tokens → our JWTs). No Supabase.
- Shared request/response schemas live in `packages/shared` as zod; never hand-write duplicate interfaces.
- Upstream API keys never ship in the mobile bundle. All third-party calls go through the API.
- Do not add Mapbox, Google Maps, Yelp, or Google Places SDKs — their terms conflict with a self-hosted, community-owned dataset.
- Chicago city limits are the product boundary. Bbox: `-87.94, 41.64, -87.52, 42.02`.
- `.claude/commands/add-chicago-apis.md` is the spec for adding upstream integrations. Read it before adding a service.
- After schema changes run `pnpm db:generate` and follow `packages/db/drizzle/README.md`.
- Run `pnpm -r typecheck && pnpm -r lint && pnpm -r test` before declaring anything done.
