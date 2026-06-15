# LegisNote Documentation Index

Welcome! This is your guide to understanding and working with LegisNote. Start here based on what you want to do.

---

## 🚀 Getting Started

**New to LegisNote? Start here:**

1. **[README.md](README.md)** — What LegisNote is, what you can do with it, and a 5-minute local setup guide
2. **[docs/deployment.md](docs/deployment.md) § Part 1** — Detailed local quickstart for developers (Docker Compose, one command)
3. Explore the running app at `http://localhost:3000`

**Want to run it on a server?**
- **[docs/deployment.md](docs/deployment.md) § Part 2** — VPS production deployment (domain, TLS, backups, ops)

---

## 📚 Understanding the System

**How the system works:**

1. **[docs/architecture.md](docs/architecture.md)** — System design, components, tech stack, and how it all fits together
   - Start here to understand the philosophy: structured content + overlay annotations + PDF export
   - Components: web app (TypeScript + tRPC), database (PostgreSQL), ingestion (Python), export (Typst)

2. **[docs/data-model.md](docs/data-model.md)** — Database schema, versioning model, and how stability works
   - How laws are versioned (snapshots)
   - How annotations survive renumbering (stable node IDs)
   - Full DDL and entity-relationship diagrams

3. **[docs/research-czech-legislation-data.md](docs/research-czech-legislation-data.md)** — Where Czech law data comes from
   - Data sources (e-Sbírka, LawGPT, zakonyprolidi)
   - How to fetch consolidated texts
   - Legal reuse & copyright status

---

## 🛠️ Developing & Contributing

**Building on LegisNote:**

1. **[README.md](README.md) § "For developers"** — Code structure, key concepts, common tasks
2. **[docs/architecture.md](docs/architecture.md) § 4** — Repository layout and monorepo structure
3. **[docs/deployment.md](docs/deployment.md) § "Schema Changes"** — How to modify the database safely

**Specific tasks:**

- **Adding a new law:** Use the `/import` page (web UI) or the Python tool (`legisnote-ingest ingest`)
- **Importing via API:** See [docs/deployment.md](docs/deployment.md) § "Import your first law" (Option B)
- **Modifying the database:** Hand-written migrations in `infra/db/migrations/` (see § "Schema Changes")
- **Running tests:** `cd tools/ingestion && pytest`
- **Building the Docker image:** `bash infra/local-up.sh` (automatic)

---

## 🎯 Reference

**Quick answers:**

| I want to... | Read... |
|---|---|
| Run LegisNote locally (5 min) | [README.md](README.md) § "Local setup for developers" |
| Deploy to a VPS | [docs/deployment.md](docs/deployment.md) § Part 2 |
| Understand the code | [docs/architecture.md](docs/architecture.md) § 2 (tech choices) + README.md § "For developers" |
| Add a new law | [docs/deployment.md](docs/deployment.md) § "Import your first law" |
| Fetch law data programmatically | [docs/research-czech-legislation-data.md](docs/research-czech-legislation-data.md) § 1–3 (API endpoints) |
| See the database schema | [docs/data-model.md](docs/data-model.md) § 3 (DDL + entity diagrams) |
| Understand versioning & amendments | [docs/data-model.md](docs/data-model.md) § 2 (versioning model) |
| Set up backups | [docs/deployment.md](docs/deployment.md) § "Backups" |
| Fix a schema issue | [docs/deployment.md](docs/deployment.md) § "Schema Changes and Migrations" |
| Understand how annotations work | [docs/architecture.md](docs/architecture.md) § 2.2 (TipTap anchoring) + [docs/data-model.md](docs/data-model.md) § 2.5 |

---

## 📋 Document Summaries

### [README.md](README.md)
**Audience:** Everyone (users, developers, contributors)  
**Length:** ~350 lines | **Read time:** 10 min

What the app does, what you can do, how to get started locally in one command, code structure overview, key concepts, common developer tasks.

### [docs/architecture.md](docs/architecture.md)
**Audience:** Developers, architects  
**Length:** ~450 lines | **Read time:** 20 min

System design principles, component architecture (web + Python + database), tech stack rationale (why tRPC, why Typst, why Postgres), ingestion pipeline stages, export pipeline, deployment topology, recent additions (LawGPT import, PDF export with overlay, visual design).

### [docs/data-model.md](docs/data-model.md)
**Audience:** Backend developers, DBAs  
**Length:** ~450 lines | **Read time:** 25 min

Database schema design, versioning model (how snapshots work), stable unit identity (how annotations survive renumbering), anchoring across versions, full DDL, entity-relationship diagram, open questions & risks.

### [docs/deployment.md](docs/deployment.md)
**Audience:** Ops/SREs, developers setting up locally  
**Length:** ~450 lines | **Read time:** 15 min

Local quickstart (5 min, one command), production VPS setup, schema migrations, backups (3-layer strategy), operations cheatsheet, troubleshooting, security notes.

### [docs/research-czech-legislation-data.md](docs/research-czech-legislation-data.md)
**Audience:** Data engineers, researchers, curious about Czech law sources  
**Length:** ~400 lines | **Read time:** 20 min

Comprehensive research on Czech law data sources (e-Sbírka, LawGPT, zakonyprolidi, EUR-Lex, etc.), consolidated text availability, ELI/Akoma Ntoso adoption status, legal reuse status, PDF structure, recommended ingestion architecture.

---

## ❓ FAQ

**Q: Can I run this locally without Docker?**  
A: Not easily — we use Docker Compose for reproducibility. But if you're brave, you can install Node 20, Python 3.11, PostgreSQL 16, and follow the Docker commands manually.

**Q: How do I import laws?**  
A: (1) Web UI: go to `/import` and type a citation or click quick-picks. (2) Python tool: `legisnote-ingest ingest --citation 91/2012 && legisnote-ingest import-manifest source/manifest/91-2012.json`. (3) API: POST to `/api/import` with the manifest JSON (editor-gated). See [docs/deployment.md](docs/deployment.md) for details.

**Q: Is this v1 or production-ready?**  
A: v1 — the core features (read laws, annotate, highlight, version tracking, PDF export) are working and live-tested. See [requirements.md](requirements.md) for what's done vs. coming. Self-hosted on a single VPS is supported.

**Q: Where's the code for X?**  
A: See **[README.md](README.md) § "For developers"** for the code structure. Quick pointers:
- Web app: `apps/web/src/`
- Python ingestion: `tools/ingestion/legisnote_ingest/`
- Shared schema: `packages/shared/`
- Database: `infra/db/`

**Q: How do I contribute?**  
A: Fork the repo, create a branch, make changes, test locally (`bash infra/local-up.sh`), and open a PR. See [README.md](README.md) § "Contributing" for details.

**Q: What's the license?**  
A: Code: TBD (open source coming). Czech law texts: public domain per § 3(a) of Act 121/2000 Sb.

---

## 🔗 Related Resources

- **[requirements.md](../requirements.md)** — Authoritative feature list + design decisions (D1–D11, FR-1…FR-26)
- **eSbírka REST API** — https://e-sbirka.gov.cz/restful-api (Czech government official law source)
- **LawGPT.cz API** — https://lawgpt.cz/api-dokumentace (proxy + LLM-enhanced interface)
- **Typst** — https://typst.app (Rust-based PDF compiler we use for print)
- **Next.js** — https://nextjs.org (TypeScript web framework)
- **PostgreSQL** — https://postgresql.org (database)

---

## 📞 Questions?

- **Issue tracker:** Open an issue on GitHub
- **Discussions:** Start a GitHub discussion for bigger questions
- **Email:** Contact the maintainers

---

**Last updated:** 2026-06-15 | Documentation version 1.1
