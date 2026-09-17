#!/bin/bash
# Loads seed data into the local docker-compose backend: landmarks + OSM layers.
# Double-click in Finder, or run ./scripts/load-data.command
cd "$(dirname "$0")/.." || exit 1
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/chicago
export JWT_SECRET=local-dev-only-secret-local-dev-only-secret
export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
set -x
if ! curl -sf localhost:3000/v1/ready >/dev/null; then
  echo "Backend is not up on :3000 — run: docker compose -f infra/docker-compose.yml up -d"; exit 1
fi
command -v pnpm >/dev/null || corepack enable
pnpm install && pnpm -r build || exit 1
pnpm --filter @wm/api seed
pnpm --filter @wm/api job:run ingest.areas
pnpm --filter @wm/api job:run ingest.layers
set +x
echo; echo "=== layers"; curl -s localhost:3000/v1/layers | python3 -m json.tool | grep -E '"key"|featureCount'
echo "=== areas: $(curl -s localhost:3000/v1/areas | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["features"]))')"
echo "=== landmarks: $(curl -s 'localhost:3000/v1/places?bbox=-87.94,41.64,-87.52,42.03&category=landmark' | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["features"]))')"
echo; echo "Done. Relaunch the app; search suggestions should be back."
