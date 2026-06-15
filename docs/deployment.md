# LegisNote — Deployment Guides

> **Status:** v1.1 (2026-06-15) — Docker Compose (local + VPS)
> **Matches:** `docs/architecture.md` § 5 (local + single-VPS topology)
> **PostgreSQL** is the source of truth (D6); MinIO holds binaries; Caddy terminates TLS.

This document has two parts: **Local Quickstart** (for developers, zero-config) and **Production VPS Deployment** (stable, self-hosted).

---

## Part 1: Local Quickstart (for developers)

### What you're doing

Running LegisNote entirely on your machine in Docker containers:
- **PostgreSQL** with the full schema
- **Next.js web app** (frontend + tRPC API)
- **Sample data:** one admin user + PoC law (91/2012 Sb.)

### Prerequisites

- **Docker Desktop** (Mac/Windows) or **Docker Engine + Compose** (Linux)
  - Check: `docker compose version` should work
- **Git**
- **Bash** (or PowerShell equivalent; script is below)

No Node.js, Python, or PostgreSQL needed — they all run in containers.

### Step 1: Clone and start the stack

```bash
git clone https://github.com/yourusername/LegisNote.git
cd LegisNote

# One command to build, start, migrate, and seed admin user
bash infra/local-up.sh
```

**What this does:**
- Builds the Next.js web app as a Docker image
- Starts Postgres (PostgreSQL 16) + web (http://127.0.0.1:3000)
- Applies `infra/db/schema.sql` to a fresh database
- Creates an admin user (`admin@legisnote.local` / `admin12345`)
- Imports the sample law (91/2012 Sb.) as a published snapshot

On success, you'll see:

```
✅ LegisNote local stack is up and running at http://localhost:3000
✅ Admin user: admin@legisnote.local / admin12345
✅ Sample law (91/2012 Sb.) imported and published
```

### Step 2: Open and explore

```bash
# In your browser:
http://localhost:3000
```

Log in with `admin@legisnote.local` / `admin12345` — you're an **editor**.

### Exploring the app

- **Home** — see the imported law + exams section
- **Zákony** → **91/2012 Sb.** — read the full law with hierarchy
- **Zkoušky** — create a study exam and highlight relevant provisions
- **Import** — fetch another law from LawGPT (try `262/2006` for the Labour Code)

### Stopping and restarting

```bash
# Stop everything (data persists)
docker compose -f infra/docker-compose.local.yml down

# Start again (reuses existing DB)
bash infra/local-up.sh

# Wipe and start fresh (reset all data)
docker compose -f infra/docker-compose.local.yml down
rm -rf infra/data/postgres-local
bash infra/local-up.sh
```

### Viewing logs

```bash
# Follow web app logs in real-time
docker compose -f infra/docker-compose.local.yml logs -f web

# Or just tail the last 100 lines
docker compose -f infra/docker-compose.local.yml logs web | tail -100
```

### Manual SQL access

```bash
# Open a psql shell in the running Postgres container
docker compose -f infra/docker-compose.local.yml exec postgres \
  psql -U legisnote -d legisnote

# Example query to see imported laws:
# SELECT citation, title_cs FROM law;
```

### Why NOT a public local deployment

The local stack uses throwaway credentials and no TLS — **never expose it publicly** (e.g., don't port-forward to the internet or put it behind a proxy). It's for development only. For real deployment, use Part 2.

---

## Part 2: Production VPS Deployment

### Prerequisites (on the VPS)

- **Linux VPS** (Ubuntu 20.04+ / Debian 11+, or any Docker-supported x86_64/arm64)
  - Minimum: 2 CPU, 2 GB RAM (fine for v1 scale)
- **Docker Engine + Compose plugin**
  - `docker compose version` should work
- **A domain name** with **A/AAAA DNS records pointing at your VPS**
  - Required for Caddy to obtain TLS certificates
- **Ports 80 + 443** open to the internet
  - Other ports (5432 Postgres, 9000 MinIO) bind to `127.0.0.1` only — not exposed

### Step 1: First-time setup

```bash
# SSH into your VPS and clone the repo
git clone https://github.com/yourusername/LegisNote.git
cd LegisNote/infra

# Copy the template and edit
cp .env.example .env

# Edit .env and set:
#   LEGISNOTE_DOMAIN=your.real.domain    (must resolve to this VPS!)
#   POSTGRES_PASSWORD=<strong random 32+ char>
#   MINIO_ROOT_PASSWORD=<strong random 32+ char>
#   AUTH_SECRET=<run: openssl rand -base64 32>
#   IMPORTER_TOKEN=<custom random token>
#   ANTHROPIC_API_KEY=sk-... (if you want PDF→Claude fallback)
nano .env     # or your editor of choice

# Make the deploy script executable
chmod +x deploy.sh

# Run the deploy script (builds web image, starts all services, applies schema)
./deploy.sh
```

**On first start:**
- Postgres applies `infra/db/schema.sql` to the empty volume (one-time, takes ~30 seconds)
- Caddy obtains TLS certificates from Let's Encrypt (needs valid domain + open ports 80/443)
- Services wait for each other before starting

### Verify everything is healthy

```bash
# Check service status
docker compose ps

# Tail logs from the web app
docker compose logs -f web

# Try HTTPS (it works!)
curl -fsS https://your.real.domain/
```

If Caddy fails to obtain a cert, check:
1. DNS resolves: `nslookup your.real.domain` from the VPS
2. Ports 80/443 open to the internet
3. No firewall blocking

### Step 2: Import your first law

The web app is running but empty. Add a law via the `/import` page or via the CLI:

**Option A: Web UI (easiest)**
1. Navigate to `https://your.real.domain/import`
2. Sign in (admin@your.domain if you haven't created users yet)
3. Type a citation (e.g., `262/2006`) or click a quick-pick
4. Click "Načíst a importovat"

**Option B: Python tool** (if you have it installed locally)
```bash
# On your local machine with Python + ingestion tool installed:
legisnote-ingest ingest --citation 262/2006

# Review source/md/262-2006.md, then push to your server:
export LEGISNOTE_IMPORTER_URL="https://your.real.domain/api/import"
export LEGISNOTE_IMPORTER_TOKEN="<the IMPORTER_TOKEN from your VPS's infra/.env>"
legisnote-ingest import-manifest source/manifest/262-2006.json
```

The law then appears on your home page.

### Step 3: Ongoing operations

#### Updating code

```bash
cd LegisNote/infra

# Pull the latest, rebuild the web image, restart containers
# (preserves all data in infra/data/)
./deploy.sh

# Or, if you've already pulled and just want to rebuild:
PULL=0 ./deploy.sh
```

#### Monitoring

```bash
# Real-time status and health
docker compose ps

# Tail all logs
docker compose logs -f

# Tail just the web app
docker compose logs -f web

# View last 50 lines of postgres
docker compose logs postgres | tail -50
```

#### Manual DB access

```bash
# SSH into the VPS, then:
cd LegisNote/infra
docker compose exec postgres psql -U legisnote -d legisnote

# Query example:
# SELECT citation, title_cs, current_snapshot_id FROM law;
```

#### Rotate a secret

Edit `infra/.env` (change a password, token, or API key) and restart:
```bash
./deploy.sh     # rebuilds and recreates affected containers
```

---

## Schema Changes and Migrations

### Background

`infra/db/schema.sql` is an **init script** that Postgres runs **only once** against an empty data directory. Editing it does **not** automatically migrate an existing database.

### For development (throwaway data)

```bash
# Stop + remove the local database volume
docker compose -f docker-compose.local.yml down
rm -rf infra/data/postgres-local

# Restart — schema is applied fresh to the empty volume
bash infra/local-up.sh
```

### For production (preserving data)

Hand-written, idempotent migrations live in `infra/db/migrations/` and are applied manually when needed.

**Example: deploying a schema change**

1. Write a new migration file (e.g., `infra/db/migrations/002_my_change.sql`)
   - Make it idempotent: use `IF NOT EXISTS`, `CREATE OR REPLACE`, etc.
   - Document: add a comment at the top explaining what and why

2. Test it locally first:
   ```bash
   # On your machine, with the local stack running:
   docker compose -f docker-compose.local.yml exec postgres \
     psql -U legisnote -d legisnote < infra/db/migrations/002_my_change.sql
   
   # Verify the change worked
   docker compose -f docker-compose.local.yml exec postgres \
     psql -U legisnote -d legisnote -c "SELECT * FROM my_new_table;"
   ```

3. Apply to production:
   ```bash
   # SSH into the VPS
   cd LegisNote/infra
   docker compose exec -T postgres \
     psql -U legisnote -d legisnote < db/migrations/002_my_change.sql
   ```

4. Update `db/schema.sql` **and `docs/data-model.md`** to reflect the new schema so fresh installs get it from the start.

### Future work: Prisma Migrate

Adopting **Prisma Migrate** (in `apps/web/prisma/migrations/`) as the single migration path is recommended for v1.1 but not critical for v1. For now, keep hand-written migrations in `infra/db/migrations/` and run them manually.

---

## Backups (NFR-5)

Three independent recovery layers (architecture § 5). Set up nightly via cron on the VPS:

### 1. Postgres dump (source of truth)

```bash
# Create a compressed dump
docker compose exec -T postgres pg_dump -U legisnote legisnote | gzip > backup/pg-$(date +%F).sql.gz

# Restore from a dump (if needed):
gunzip -c backup/pg-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U legisnote -d legisnote
```

### 2. MinIO backup (binaries)

```bash
# Archive MinIO data directory (PDFs, exports)
docker run --rm -v "$PWD/data/minio:/data:ro" -v "$PWD/backup:/backup" alpine \
  tar czf /backup/minio-$(date +%F).tar.gz -C /data .
```

### 3. Git mirror (clean Markdown)

The git mirror in `infra/git-mirror.git` (created by the ingestion tool) is automatically a backup of clean Markdown. Periodically push it to a remote:

```bash
cd infra/git-mirror.git
git push <remote-url> main
```

### Cron example (nightly backups at 2 AM)

Create a script `infra/backup.sh`:

```bash
#!/bin/bash
cd /path/to/LegisNote/infra
mkdir -p backup

# Postgres
docker compose exec -T postgres pg_dump -U legisnote legisnote | gzip > backup/pg-$(date +%F).sql.gz

# MinIO
docker run --rm -v "$PWD/data/minio:/data:ro" -v "$PWD/backup:/backup" alpine \
  tar czf /backup/minio-$(date +%F).tar.gz -C /data .

# Copy to off-site (e.g., S3, rsync, scp)
# aws s3 sync backup/ s3://my-backup-bucket/legisnote/
# or: rsync -a backup/ user@backup.host:/backups/legisnote/
```

Then add to crontab:
```bash
crontab -e
# Add: 0 2 * * * /path/to/LegisNote/infra/backup.sh
```

---

## Operations Cheatsheet

Run these from `LegisNote/infra/`:

| Task | Command |
|------|---------|
| **Status** | `docker compose ps` |
| **Logs** | `docker compose logs -f web` |
| **Restart one service** | `docker compose restart web` |
| **Stop everything** | `docker compose down` |
| **Rebuild after code change** | `./deploy.sh` |
| **psql shell** | `docker compose exec postgres psql -U legisnote -d legisnote` |
| **Apply migration** | `docker compose exec -T postgres psql -U legisnote -d legisnote < db/migrations/NNN_name.sql` |
| **Enable Meilisearch (v2)** | `docker compose --profile v2 up -d meilisearch` |

---

## Security Notes

- **Secrets:** `infra/.env` is git-ignored — never commit real secrets. Use environment variables or Docker secrets.
- **Exposure:** Only Caddy is internet-facing (ports 80/443). Postgres, MinIO, and Meilisearch bind to `127.0.0.1` only.
- **SSH:** Restrict SSH access to your VPS via key-only auth + IP whitelist on your firewall.
- **Firewall:** Open only ports 22 (SSH), 80, and 443 to the world. Everything else `REJECT`.
- **TLS:** Caddy auto-renews Let's Encrypt certificates; no action needed.
- **Secrets rotation:** Edit `.env` and `./deploy.sh` recreates affected containers with the new values.

---

## Troubleshooting

### "Caddy can't obtain TLS cert"

- Check DNS: `nslookup your.real.domain` from the VPS
- Check ports: `curl -v http://your.real.domain:80` should work
- Check firewall: ISP or cloud provider blocking 80/443?
- Caddy logs: `docker compose logs caddy`

### "Postgres connection refused"

- Check if postgres is running: `docker compose ps`
- Check logs: `docker compose logs postgres`
- Verify .env `POSTGRES_PASSWORD` is strong (no special shell chars unless quoted)

### "Web app can't connect to Postgres"

- Services are on the same Docker network. Check: `docker network ls | grep legisnote`
- If network doesn't exist: `docker compose down && ./deploy.sh`

### "Out of disk space"

- Postgres and MinIO grow over time
- Backups should be archived off-site and old local backups deleted
- Check: `du -sh infra/data/postgres infra/data/minio infra/backup/`

---

## Local (Development) vs. Production Comparison

| Aspect | Local (`docker-compose.local.yml`) | Production (`docker-compose.yml`) |
|--------|---|---|
| **Binds** | `127.0.0.1:3000` only | Caddy `0.0.0.0:80/443` |
| **TLS** | None | Automatic (Let's Encrypt) |
| **Secrets** | `local.env` (hardcoded defaults, safe) | `.env` (git-ignored, unique per deployment) |
| **Reverse proxy** | None | Caddy |
| **MinIO** | Optional | Included |
| **Data persistence** | `infra/data/postgres-local/` | `infra/data/postgres/`, `infra/data/minio/` |
| **Log retention** | None (dev) | Kept for `docker compose logs` |
| **Admin user** | `admin@legisnote.local` / `admin12345` (dev-only) | You set it in `.env` |

