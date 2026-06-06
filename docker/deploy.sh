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

echo "[deploy] build + (re)start backend, bridge, feishu bridges & caddy"
docker compose build backend bridge feishu feishu2
docker compose up -d caddy backend bridge feishu feishu2

echo "[deploy] done."
docker compose ps
