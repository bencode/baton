#!/bin/sh
# Apply migrations to the SQLite db on the volume, then run the server (tsx).
set -e
cd /app/packages/server

echo "[baton] prisma migrate deploy..."
node_modules/.bin/prisma migrate deploy

echo "[baton] starting server (tsx src/index.ts)..."
exec node_modules/.bin/tsx src/index.ts
