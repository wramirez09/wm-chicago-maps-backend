#!/usr/bin/env bash
# Deploys the Photon and Valhalla apps. Run rarely — their images don't change;
# their data lives on volumes and is rebuilt per build-data.md.
set -euo pipefail
cd "$(dirname "$0")"
for app in chicago-photon chicago-valhalla; do
  echo "== $app"
  flyctl deploy --config "$app/fly.toml" --remote-only "$@"
done
