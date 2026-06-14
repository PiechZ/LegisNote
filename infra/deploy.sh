#!/usr/bin/env bash
# LegisNote — VPS deploy / update script.
#
# First-time setup and every subsequent update both run through here. Run it on
# the VPS from the infra/ directory:  ./deploy.sh
#
# It pulls the latest code, rebuilds the web image, and (re)starts the stack.
# Postgres data, MinIO objects, and Caddy certs live in ./data and survive
# restarts. See docs/deployment.md for the full runbook.
set -euo pipefail

cd "$(dirname "$0")"          # infra/
REPO_ROOT="$(cd .. && pwd)"

if [[ ! -f .env ]]; then
  echo "ERROR: infra/.env not found. Copy infra/.env.example -> infra/.env and fill secrets." >&2
  exit 1
fi

# Prefer the v2 compose plugin; fall back to the legacy binary.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: docker compose is not installed." >&2
  exit 1
fi

PULL=${PULL:-1}
if [[ "$PULL" == "1" && -d "$REPO_ROOT/.git" ]]; then
  echo "==> Pulling latest code"
  git -C "$REPO_ROOT" pull --ff-only
fi

echo "==> Validating compose configuration"
$DC config -q

echo "==> Building web image"
$DC build web

echo "==> Starting stack (postgres, minio, web, caddy)"
$DC up -d

echo "==> Waiting for services to report healthy"
$DC ps

cat <<'EOF'

Deploy complete.
  - First run only: the DB schema (db/schema.sql) is applied automatically on the
    empty Postgres volume. It does NOT re-run on later deploys — see the
    "Schema changes" section of docs/deployment.md before changing the schema.
  - Import a law:  see docs/deployment.md "Importing a law".
  - Logs:          docker compose logs -f web
EOF
