# LegisNote

A web app for **law students and lawyers** to study and navigate (Czech) legislation —
tagging, annotating, commenting, linking, and versioning laws at every level — plus a
**Python ingestion pipeline** that converts official Czech laws into clean, versioned Markdown.

> Status: early scaffold. The ingestion pipeline runs end-to-end for the PoC law
> (91/2012 Sb.); the web app is a working skeleton (reader page + tRPC API + importer
> endpoint) with DB schema in place. See [`docs/`](docs/) for the design.

## Documentation

| Doc | What |
|-----|------|
| [requirements.md](requirements.md) | Requirements + decisions log (D1–D11) |
| [docs/architecture.md](docs/architecture.md) | System architecture, stack, deployment |
| [docs/data-model.md](docs/data-model.md) | PostgreSQL schema + versioning model |
| [docs/research-czech-legislation-data.md](docs/research-czech-legislation-data.md) | Where/how to get Czech law data |

## Repository layout

```
apps/web/            Next.js app (frontend + tRPC API + Prisma)
services/export/     Print/electronic export worker (placeholder)
tools/ingestion/     Python ingestion pipeline (Czech law -> Markdown + manifest)
packages/shared/     Cross-language contract: manifest JSON schema + TS types
source/              Law artifacts: pdf/ (raw) · md/ (clean) · manifest/ · cache/ (gitignored)
infra/               docker-compose, Caddyfile, db/schema.sql, .env.example
docs/                Design docs
```

The TS app and the Python tool meet at one contract: **`clean.md` + `manifest.json`**,
validated against [`packages/shared/schema/manifest.schema.json`](packages/shared/schema/manifest.schema.json).

## Prerequisites

- Node 20 + pnpm (`corepack enable`)
- Python 3.11+
- Docker (for Postgres/MinIO)

## Quickstart

### 1. Ingest a law (works today, no API key — uses the LawGPT.cz proxy)

```bash
cd tools/ingestion
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"     # Windows; use .venv/bin on *nix

# Fetch + parse + emit clean Markdown and a validated manifest into source/:
.venv/Scripts/legisnote-ingest ingest \
  --citation 91/2012 \
  --title "Zákon o mezinárodním právu soukromém" \
  --effective-from 2023-09-23

# Or parse a local file fully offline:
.venv/Scripts/legisnote-ingest ingest --citation 91/2012 \
  --title "…" --effective-from 2023-09-23 --from-file path/to/text.md

pytest    # 5 tests: parser, emitter, schema validation
```

Outputs: `source/md/91-2012.md` and `source/manifest/91-2012.json`.

### 2. Bring up the database

```bash
cp infra/.env.example infra/.env   # then edit secrets
pnpm db:up                          # postgres with schema from infra/db/schema.sql
```

### 3. Run the web app

```bash
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm --filter @legisnote/web db:pull       # regenerate Prisma schema from the live DB
pnpm --filter @legisnote/web db:generate
pnpm dev                                    # http://localhost:3000
```

### 4. Import an ingested law into the app *(importer endpoint is a stub)*

```bash
LEGISNOTE_IMPORTER_URL=http://localhost:3000/api/import \
LEGISNOTE_IMPORTER_TOKEN=<IMPORTER_TOKEN from apps/web/.env> \
  tools/ingestion/.venv/Scripts/legisnote-ingest import-manifest source/manifest/91-2012.json
```

> The importer currently validates auth + manifest and returns `501 Not Implemented`.
> The DB upsert (stable-node matching across snapshots) is the next step — see
> [docs/data-model.md](docs/data-model.md) §2.

## Secrets (D10/D11)

Your own **Anthropic Claude API key** is used only by the ingestion PDF-fallback path.
The **eSbírka API key** (per-request, from the Ministry of Interior) is optional and
arrives later. Both live in `infra/.env` (gitignored) — see `infra/.env.example`.

## License

Code: TBD. Czech law texts are public domain (§ 3(a) of Act 121/2000 Sb.).
