# LegisNote — VPS Deployment Runbook

> **Status:** v1 (self-hosted, single-VPS, Docker Compose). Matches `docs/architecture.md` §6.
> PostgreSQL is the source of truth (D6); MinIO holds binaries; Caddy terminates TLS.

The whole stack runs as Docker Compose services on one VPS: `postgres`, `minio`,
`web` (Next.js + tRPC), and `caddy` (reverse proxy + automatic TLS). The Python
ingestion tool (`tools/ingestion`) is **not** a long-running service — it runs on
demand and POSTs to the web app's importer. Meilisearch is v2 (disabled by default).

---

## 0. Local quickstart (try it on your machine)

For a local run you don't need a domain, TLS, secrets, or an `.env` file. A
separate **zero-config** stack (`infra/docker-compose.local.yml`) runs just
Postgres + the web app, bound to `127.0.0.1`, with safe dev defaults baked in.

**Prerequisite:** Docker Desktop (or Docker Engine + Compose) running.

```bash
cd infra
./local-up.sh        # builds, starts, applies migrations, seeds an admin user
```

Then open **http://localhost:3000** and log in with `admin@legisnote.local` /
`admin12345` (override via `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars). The script
is idempotent — re-run it any time.

PowerShell (no bash) equivalent of the script's core steps:

```powershell
cd infra
docker compose -f docker-compose.local.yml --env-file local.env up -d --build --wait
# schema.sql is applied automatically on the empty volume; this migration is a
# no-op on a fresh DB and required only for a pre-existing one (FR-16/17 column):
Get-Content db/migrations/001_publish_gate.sql | `
  docker compose -f docker-compose.local.yml exec -T postgres psql -U legisnote -d legisnote
docker compose -f docker-compose.local.yml exec -T -w /repo/apps/web web `
  node scripts/create-user.mjs admin@legisnote.local admin12345 admin Admin
```

Import the PoC law and publish it (FR-16/17): see the script's printed next-steps,
or §"Importing a law" below using `LEGISNOTE_IMPORTER_TOKEN=dev-importer-token` and
`LEGISNOTE_IMPORTER_URL=http://localhost:3000/api/import`.

Manage the local stack:

```bash
docker compose -f docker-compose.local.yml logs -f web   # logs
docker compose -f docker-compose.local.yml down          # stop
docker compose -f docker-compose.local.yml down && rm -rf data/postgres-local   # reset DB
```

> The local stack uses throwaway credentials and no TLS — never expose it publicly.
> For a real deployment use the production compose + `infra/.env` (§1 onward).

---

## 1. Prerequisites (on the VPS)

- A Linux VPS (Docker's supported x86_64/arm64) with **Docker Engine + the Compose plugin**
  (`docker compose version` works).
- A domain name with **A/AAAA DNS records pointing at the VPS** before first start
  (Caddy needs this to obtain TLS certificates).
- Ports **80** and **443** open to the internet. Postgres/MinIO/Meilisearch bind to
  `127.0.0.1` only — they are never exposed publicly.

---

## 2. First-time setup

```bash
git clone <your-repo-url> legisnote
cd legisnote/infra

cp .env.example .env
# Edit .env and set strong, unique values for at least:
#   POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, AUTH_SECRET, IMPORTER_TOKEN
#   LEGISNOTE_DOMAIN=your.real.domain   (must resolve to this VPS)
# Generate secrets, e.g.:
#   openssl rand -base64 32   # AUTH_SECRET
#   openssl rand -hex 32      # IMPORTER_TOKEN, passwords

chmod +x deploy.sh
./deploy.sh
```

On the **first** start, the Postgres container applies `infra/db/schema.sql` to the
empty data volume (full DDL: tables, enums, ltree/tsvector/FTS config). This runs
**once** — see §5 before you ever change the schema.

Verify:

```bash
docker compose ps                 # all services Up / healthy
docker compose logs -f web        # app boot logs
curl -fsS https://your.real.domain/   # the reader home page
```

---

## 3. Updating an existing deployment

```bash
cd legisnote/infra
./deploy.sh        # git pull --ff-only, rebuild web, recreate containers
```

`./deploy.sh` is idempotent. Data in `infra/data/` (Postgres, MinIO, Caddy certs)
is preserved across rebuilds. To deploy without pulling (e.g. you already pulled):
`PULL=0 ./deploy.sh`.

---

## 4. Importing a law

The web app owns the database; ingestion never writes Postgres directly — it POSTs a
manifest to the token-authed importer (`POST /api/import`). From a machine with the
Python tool installed (`tools/ingestion`, venv at `tools/ingestion/.venv`):

```bash
# 1. Produce clean Markdown + manifest (LawGPT source, no key needed):
legisnote-ingest ingest --citation 91/2012

# 2. Review source/md/91-2012.md, then push the manifest to the live importer:
export LEGISNOTE_IMPORTER_URL="https://your.real.domain/api/import"
export LEGISNOTE_IMPORTER_TOKEN="<the IMPORTER_TOKEN from infra/.env>"
legisnote-ingest import-manifest source/manifest/91-2012.json
```

The law then appears on the home page and at `/law/91-2012`.

---

## 5. Schema changes (IMPORTANT)

`db/schema.sql` is an **init script**: Postgres runs it only against an *empty* data
directory. Editing it does **not** migrate an existing database. For v1 the options are:

- **Throwaway data (dev/PoC):** stop the stack, remove the volume, restart — the new
  schema is applied fresh:
  ```bash
  docker compose down
  rm -rf data/postgres        # DESTROYS all data
  ./deploy.sh
  ```
- **Preserving data:** apply the change as a manual SQL migration. Hand-written,
  idempotent migrations live in `infra/db/migrations/`; run the ones not yet applied:
  ```bash
  docker compose exec -T postgres psql -U legisnote -d legisnote \
    < db/migrations/001_publish_gate.sql
  ```

  > **001_publish_gate.sql** is required by the editorial workflow (FR-16/17): it adds
  > `law_snapshot.status` (`draft`/`published`). Without it the app errors on any law
  > page (the query selects `status`). Existing snapshots are backfilled to `published`
  > so currently-rendering laws keep rendering; new imports land as `draft`.

> Adopting **Prisma Migrate** (`apps/web/prisma/migrations`) as the single migration
> path is the recommended v1.1 follow-up; until then, keep `db/schema.sql` and any
> hand-written migrations in sync, and run `pnpm --filter @legisnote/web db:pull` to
> refresh the Prisma client after schema changes.

---

## 6. Backups (NFR-5)

Three independent recovery layers (architecture §6). Run nightly via cron on the VPS:

```bash
# Postgres — the source of truth (full logical dump)
docker compose exec -T postgres pg_dump -U legisnote legisnote | gzip > backup/pg-$(date +%F).sql.gz

# MinIO — PDFs and generated exports
docker run --rm -v "$PWD/data/minio:/data:ro" -v "$PWD/backup:/backup" alpine \
  tar czf /backup/minio-$(date +%F).tar.gz -C /data .
```

Copy `backup/` off-site. The git mirror of clean Markdown (D6/FR-24) is the third layer.

To restore Postgres:

```bash
gunzip -c backup/pg-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U legisnote -d legisnote
```

---

## 7. Operations cheatsheet

| Task | Command (run in `infra/`) |
|------|---------------------------|
| Status / health | `docker compose ps` |
| Tail app logs | `docker compose logs -f web` |
| Restart one service | `docker compose restart web` |
| Stop everything | `docker compose down` |
| Rebuild after code change | `./deploy.sh` |
| psql shell | `docker compose exec postgres psql -U legisnote -d legisnote` |
| Enable Meilisearch (v2) | `docker compose --profile v2 up -d meilisearch` |

---

## 8. Security notes

- `infra/.env` holds all secrets and is git-ignored — never commit it.
- Only Caddy is internet-facing; Postgres/MinIO/Meilisearch bind to `127.0.0.1`.
- Rotate a secret by editing `infra/.env` and running `./deploy.sh` (recreates the
  affected containers).
- Restrict SSH and keep the host's firewall to ports 22/80/443.
