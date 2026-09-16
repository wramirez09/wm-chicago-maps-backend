# Chicago Local Map

A Chicago-only map of independently owned places. Locally owned, locally operated.

**Status:** pre-alpha. Nothing runs yet; this repo currently holds the specs and the Claude Code commands that scaffold it.

## What this is

A mobile app (bare React Native + MapLibre Native) and a Node/TypeScript backend (Fastify + Drizzle/PostGIS + pg-boss) that map Chicago's independent businesses, neighborhood guides and events, transit, and community-submitted places. City limits are the product boundary. No pay-to-rank, ever.

## Planned layout

```
apps/
  api/        Fastify service — deploys to Fly.io (ord)
  mobile/     bare React Native app
  admin/      moderation web app (later)
packages/
  shared/     zod schemas + types shared across apps
  db/         Drizzle schema, migrations, PostGIS helpers
  config/     shared tsconfig / eslint / prettier
infra/        docker-compose for local dev, Fly configs
```

## Building it with Claude Code

The `.claude/commands/` folder holds the specs as slash commands. Run them in this order from the repo root:

```
/init-chicago-api
/init-chicago-map ChicagoLocal
/add-chicago-apis places
/add-chicago-apis transit
/add-chicago-apis neighborhoods
/add-chicago-apis events
/add-chicago-apis plumbing
```

Each command is self-contained and documents the stack choices it enforces.

## Data sources

City of Chicago Data Portal (business licenses, business owners, community areas, wards, parks, landmarks), Cook County Open Data, Overture Maps Places, OpenStreetMap, CTA Train/Bus Tracker, Divvy GBFS, Metra GTFS, Ticketmaster Discovery, Bandsintown, Wikipedia/Wikidata. See `.claude/commands/add-chicago-apis.md` for how each is used.

## Principles

- **Chicago only.** No suburbs, no expansion roadmap.
- **Independent first.** Chains are excluded by rule; ownership is verified against public license and owner records, then vouched for by neighbors.
- **Community-trusted.** Sorting is by relevance and proximity only. Data practices are published in plain English.

## License

MIT — see [LICENSE](LICENSE).
