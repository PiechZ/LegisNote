#!/usr/bin/env bash
# LegisNote — one-command LOCAL bring-up (zero config).
#
#   ./local-up.sh            # build + start, apply migration, seed admin
#
# Brings up the local stack (docker-compose.local.yml), waits for health, applies
# the idempotent DB migrations, and seeds an admin user. Re-runnable any time.
#
# Overridable via env: ADMIN_EMAIL, ADMIN_PASSWORD, POSTGRES_USER, POSTGRES_DB.
set -euo pipefail

cd "$(dirname "$0")" # infra/

COMPOSE_FILE="docker-compose.local.yml"
PGUSER="${POSTGRES_USER:-legisnote}"
PGDB="${POSTGRES_DB:-legisnote}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@legisnote.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin12345}"

# Prefer the v2 compose plugin; fall back to the legacy binary.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose -f $COMPOSE_FILE"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose -f $COMPOSE_FILE"
else
  echo "ERROR: docker compose is not installed, or the Docker daemon isn't running." >&2
  exit 1
fi

echo "==> Building and starting the local stack (postgres + web)"
$DC up -d --build --wait --wait-timeout 420

echo "==> Applying DB migrations (idempotent)"
for m in db/migrations/*.sql; do
  [ -e "$m" ] || continue
  echo "    - $(basename "$m")"
  $DC exec -T postgres psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" < "$m"
done

echo "==> Seeding admin user (idempotent upsert)"
$DC exec -T -w /repo/apps/web web \
  node scripts/create-user.mjs "$ADMIN_EMAIL" "$ADMIN_PASSWORD" admin "Admin"

cat <<EOF

✅ LegisNote is up:  http://localhost:3000
   Login:    $ADMIN_EMAIL  /  $ADMIN_PASSWORD   (role: admin)

Next — import the proof-of-concept law (91/2012), then publish it (FR-16/17):
  1) from tools/ingestion (venv active):
       legisnote-ingest ingest --citation 91/2012
       LEGISNOTE_IMPORTER_URL=http://localhost:3000/api/import \\
       LEGISNOTE_IMPORTER_TOKEN=dev-importer-token \\
         legisnote-ingest import-manifest ../../source/manifest/91-2012.json
     (the snapshot lands as a DRAFT)
  2) open http://localhost:3000/law/91-2012/edit  → clean text → "Publikovat znění"

Manage the stack:
  logs:   docker compose -f infra/$COMPOSE_FILE logs -f web
  stop:   docker compose -f infra/$COMPOSE_FILE down
  reset:  docker compose -f infra/$COMPOSE_FILE down && rm -rf infra/data/postgres-local
EOF
