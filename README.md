# LegisNote

A modern web app for **law students and lawyers** to actively study and explore Czech legislation. Read laws with precise annotations, tag important passages, highlight text for exams, track changes across versions, and export everything to PDF.

The platform includes a **Python ingestion pipeline** that fetches official Czech laws, parses them into clean hierarchical text, and automatically detects amendments and changes. No manual data entry — just one command to import a new law.

## What you can do

- **Read any Czech law** in a clean, distraction-free interface with proper hierarchy (parts → titles → sections → paragraphs)
- **Tag and annotate** at any level — mark important words with colored tags, add notes to paragraphs, or comment on whole sections
- **Create study exams** and highlight provisions relevant to each one
- **Track law changes** — see when provisions were added, removed, or amended, and view old versions as they stood on any date
- **Export to PDF** — download the law with your annotations, highlights, and exam notes baked in (screen or print quality)
- **Import new laws** instantly from LawGPT.cz with a single citation (89/2012, 40/2009, etc.), no manual work

## Getting started: Local setup for developers

The **fastest way to run LegisNote locally** is with Docker Compose. Everything (database, web app, sample data) comes up in one command.

### Prerequisites

- **Docker & Docker Compose** (for the app, database, and dependencies)
  - [Install Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Compose)
- **Git** (to clone the repo)

That's it. You don't need Node.js, Python, or PostgreSQL installed — they all run in containers.

### Step 1: Clone and navigate

```bash
git clone https://github.com/yourusername/LegisNote.git
cd LegisNote
```

### Step 2: Start the stack with one command

```bash
bash infra/local-up.sh
```

This script will:
1. Build the web app Docker image (on first run)
2. Start PostgreSQL with the LegisNote schema
3. Start the web server
4. Create a sample admin user (`admin@legisnote.local` / `admin12345`)
5. Import the sample law (91/2012 Sb. — "Law on Private International Law")

Wait for the success message — **you'll see a URL and instructions**.

### Step 3: Open the app

```
http://localhost:3000
```

Sign in with:
- **Email:** `admin@legisnote.local`
- **Password:** `admin12345`

You're now logged in as an **editor** — you can import laws, edit text, and manage exams.

### Step 4: Explore

- **Home page** — see the imported law and create study exams
- **Zákony** (Laws) — click "91/2012 Sb." to read the full law with its hierarchical structure
- **Zkoušky** (Exams) — create an exam and highlight provisions relevant to it
- **Import** — add new laws by typing their citation (e.g., `89/2012` for the Civil Code)

### Stopping and restarting

```bash
# Stop the stack
docker compose -f infra/docker-compose.local.yml down

# Start again (data persists)
bash infra/local-up.sh

# Wipe everything and start fresh
docker compose -f infra/docker-compose.local.yml down
rm -rf infra/data/postgres-local
bash infra/local-up.sh
```

### Logs

View what's happening:

```bash
docker compose -f infra/docker-compose.local.yml logs -f web
```

## For developers: Building on LegisNote

### Understanding the code structure

```
apps/web/                      Next.js web app
├── src/app/                   Pages and API routes
├── src/components/            Reusable React components
├── src/server/                Backend (tRPC API, database queries, auth)
│   ├── routers/               tRPC procedures (law, study, overlay, editorial)
│   ├── auth.ts                Authentication (email/password + sessions)
│   ├── export/                PDF export (Typst markup generation)
│   └── import/                Law import (manifest parsing, LawGPT fetching)
└── public/                    Static assets (logo, fonts)

tools/ingestion/               Python pipeline (fetch laws, parse, emit Markdown)
├── legisnote_ingest/
│   ├── pipeline.py            Main orchestration
│   ├── parse/                 Text parsing (Czech statute hierarchy)
│   ├── adapters/              Law data sources (LawGPT, eSbírka, PDF)
│   └── mirror.py              Git backup of clean Markdown
└── tests/                     Unit tests

packages/shared/               Shared TypeScript + JSON schemas
├── schema/                    Manifest JSON schema (law import contract)
└── src/index.ts               Shared TS types

infra/                         Deployment & database
├── docker-compose.local.yml   Local dev stack
├── docker-compose.yml         Production stack
├── db/schema.sql              PostgreSQL schema
└── local-up.sh                Bootstrap script
```

### Key concepts

**Manifest** — A JSON file (`packages/shared/schema/manifest.schema.json`) that describes a law: its citation, effective date, and hierarchical unit tree. Both the Python ingestion tool and the web app work with this single contract. This means you can ingest a law once, and then import it into the app (or share it with others).

**Snapshot** — Laws can change (amendments, repeals, new provisions). Each change is a new "snapshot" with an effective date. The app lets you view the law as it stood on any past date, and highlights what changed.

**Unit** — A piece of the law: a part (ČÁST), title (HLAVA), section (§), paragraph (odstavec), or point (písmeno). Each unit has a stable `node_key` (like `s12` for § 12) so highlighting and annotations survive renumbering.

**Overlay** — Your annotations on a law: tags, notes, highlighted passages. These are separate from the law text itself, so the law always stays clean and official.

### Common tasks

**Import a new law interactively:**
- Go to `/import` in the web app
- Type a citation (e.g., `262/2006` for the Labour Code) or click a quick-pick
- Click "Načíst a importovat" → it fetches, parses, and imports as a draft
- Go to `/law/262-2006/edit` to review and publish

**Run tests:**
```bash
cd tools/ingestion
.venv/Scripts/pytest
```

**Generate fresh Prisma client** (after schema changes):
```bash
pnpm --filter @legisnote/web db:generate
```

**Check types:**
```bash
pnpm --filter @legisnote/web tsc --noEmit
```

**Reset the database** while keeping the container running:
```bash
docker compose -f infra/docker-compose.local.yml exec -T postgres psql -U legisnote -d legisnote \
  -c "DELETE FROM exam; DELETE FROM law_snapshot; DELETE FROM law;"
```

## Architecture & design

- **Frontend:** Next.js + React (TypeScript) with a visual design centered on the logo colors (aubergine + gold)
- **Backend:** tRPC API + Prisma ORM + PostgreSQL
- **Auth:** NextAuth.js with email/password + secure sessions
- **PDF export:** Typst markup compiler (Rust-based) + optional Ghostscript (print quality)
- **Ingestion:** Python with requests, BeautifulSoup, regex parser for Czech statutory hierarchy
- **Deployment:** Docker Compose locally, production stack on any server

Full architecture docs: [`docs/architecture.md`](docs/architecture.md)

## Documentation

| Doc | Purpose |
|-----|---------|
| [requirements.md](requirements.md) | Feature list + design decisions (D1–D11) |
| [docs/architecture.md](docs/architecture.md) | System design, stack, deployment strategy |
| [docs/data-model.md](docs/data-model.md) | PostgreSQL schema + versioning approach |
| [docs/research-czech-legislation-data.md](docs/research-czech-legislation-data.md) | Where to find Czech law data + API endpoints |

## Contributing

LegisNote is in active development. To contribute:

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make changes and test locally (`bash infra/local-up.sh`)
4. Open a pull request

Focus areas where we'd love help:
- UI/UX polish (design suggestions, accessibility)
- Testing (unit tests, E2E tests)
- More law sources (eSbírka API integration, PDF parsing improvements)
- Performance (caching, query optimization)
- Localization (Czech is primary, but Spanish, Polish, etc. can follow the same pattern)

## Secrets & configuration

### Local setup
`infra/local.env` (created by `local-up.sh`) contains default dev credentials — safe to commit, never used in production.

### Production
Never commit real secrets. Use environment variables or a secrets manager:
- `DATABASE_URL` — Postgres connection
- `NEXTAUTH_URL` — app URL (for auth redirects)
- `NEXTAUTH_SECRET` — random 32+ char string (generate: `openssl rand -base64 32`)
- `IMPORTER_TOKEN` — token for law import endpoint (custom random string)
- Optional: `LAWGPT_BASE_URL`, `ANTHROPIC_API_KEY`, `ESBIRKA_API_KEY`

See `infra/.env.example` for all variables.

## License

**Code:** TBD (open source coming).  
**Czech law texts:** Public domain per § 3(a) of Act 121/2000 Sb.

## Questions?

- Check [`docs/`](docs/) for deeper dives
- Open an issue on GitHub
- Contribute a PR!

---

**Current status:** Early scaffold. The ingestion pipeline and web app are functional end-to-end. See [`requirements.md`](requirements.md) for what's done and what's next.
