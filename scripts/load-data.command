#!/bin/bash
# Loads seed data into the local docker-compose backend: landmarks + community areas + OSM layers.
# Runs entirely in containers against the same image the API serves — no host Node or pnpm needed.
# Double-click in Finder, or run ./scripts/load-data.command
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

COMPOSE="docker compose -f infra/docker-compose.yml"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running — start Docker Desktop and try again."; exit 1
fi
if ! curl -sf localhost:3000/v1/ready >/dev/null; then
  echo "Backend is not up on :3000 — run: $COMPOSE up -d"; exit 1
fi

set -ex
$COMPOSE run --rm --no-deps api node dist/seed.js
$COMPOSE run --rm --no-deps api node dist/jobs/run.js ingest.areas
$COMPOSE run --rm --no-deps api node dist/jobs/run.js ingest.layers
set +ex

echo; echo "=== layers"; curl -s localhost:3000/v1/layers | python3 -m json.tool | grep -E '"key"|featureCount'
echo "=== areas: $(curl -s localhost:3000/v1/areas | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["features"]))')"
echo "=== landmarks: $(curl -s 'localhost:3000/v1/places?bbox=-87.94,41.64,-87.52,42.03&category=landmark' | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["features"]))')"
echo; echo "Done. Relaunch the app; search suggestions should be back."
