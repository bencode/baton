#!/bin/bash
# baton deploy — run on the host from anywhere; cds to the repo root.
# Usage: docker/deploy.sh   (git pull → rebuild SPA + backend → up -d)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[deploy] git pull"
git pull --ff-only

cd docker

echo "[deploy] build web (SPA → web-dist volume)"
docker compose --profile build build web-build
docker compose --profile build run --rm web-build

echo "[deploy] build + (re)start backend, bridge"
docker compose build backend bridge
docker compose up -d backend bridge

# The Caddyfile is a single-FILE bind mount. `git pull` replaces it with a new
# inode, but a running container stays bound to the OLD inode — so `caddy reload`
# (and even `restart`, which keeps the container) would re-read the stale config.
# Force-recreate so caddy re-binds the current Caddyfile. (`up -d` alone is a
# no-op here: the service definition is unchanged.)
echo "[deploy] recreate caddy (re-bind the updated Caddyfile)"
docker compose up -d --force-recreate caddy

echo "[deploy] done."
docker compose ps
