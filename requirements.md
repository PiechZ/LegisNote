# LegisNote — Requirements

> Working title. A web application for law students and lawyers to study, annotate, and navigate legislation, with a supporting pipeline that converts official PDF laws into clean, versioned, machine-friendly text.

**Status:** Draft v0.3 — capture + two rounds of decisions (2026-06-14)
**Owner:** piech.zbynek@gmail.com

### Decisions Log
| # | Decision | Date |
|---|----------|------|
| D1 | **Source data:** structured Czech-law data is available as **JSON/Markdown** (eSbírka REST API; LawGPT.cz proxy needs no key and returns Markdown; zakonyprolidi.cz; EUR-Lex XML for EU-origin law only — **there is no XML/Akoma Ntoso for Czech national law**). Ingestion **prefers structured sources** and **falls back to born-digital PDF** (no OCR for modern laws) + a Claude structure pass. See `docs/research-czech-legislation-data.md`. | 2026-06-14 |
| D2 | **Versioning (v1):** primary axis is **official amendments** — track how the law itself changes over time. | 2026-06-14 |
| D3 | **Stack:** **TypeScript main web app + separate Python ingestion tool.** (Option A.) | 2026-06-14 |
| D4 | **Print (v1):** **generic print-ready PDF** (target ~PDF/X-1a, A5/B5 book) is acceptable; refine once a specific printer is chosen. | 2026-06-14 |
| D5 | **Consolidated text only:** v1 stores the **current consolidated text** of each law. Versioning keeps a sequence of consolidated snapshots (so diffs work), but we do **not** reconstruct/display individual amending acts. | 2026-06-14 |
| D6 | **git = backup only.** **PostgreSQL is the live source of truth.** Clean Markdown is mirrored to git for source versioning/backup. | 2026-06-14 |
| D7 | **PoC law:** *Zákon o mezinárodním právu soukromém* (Act on Private International Law, **91/2012 Sb.**) is the first end-to-end proof of concept. | 2026-06-14 |
| D8 | **Book-sale licensing** is not a concern for now. | 2026-06-14 |
| D9 | **Test-highlight database** is **manually curated by admins** in v1. | 2026-06-14 |
| D10 | **Ingestion LLM:** use the **Anthropic Claude API** with the **user's own API key**. | 2026-06-14 |
| D11 | **eSbírka API key:** obtainable later on a **per-request basis**; not available now. Design for it but assume it arrives later; PoC may rely on PDF/manual input until then. | 2026-06-14 |

---

## 1. Vision & Goals

Build software that helps **law students** and **lawyers** study legislation and orient themselves quickly within it. The product has two cooperating parts:

1. **LegisNote (web app)** — read, annotate, tag, link, comment on, and version laws; study aids; full-text search; export to print.
2. **PDF→Markdown ingestion tool (separate app)** — converts official Czech laws (published only as PDF) into clean, simple text (Markdown), so the conversion cost (LLM credits / manual effort) is paid once and the result is reusable and version-controlled.

A motivating principle: Czech laws being PDF-only is a poor fit for the LLM age; converting them to open, simple formats is valuable in itself.

---

## 2. Personas / User Roles

| Role | Description | Release |
|------|-------------|---------|
| **Reader (student / lawyer)** | Reads laws, makes personal annotations, tags, highlights, links, comments. Uses study aids. | v1 (read-only on shared repo) → v2 (personal edits) |
| **Law Administrator / Editor** | Curates the shared repository: imports laws, edits/cleans parsed text, prepares laws for publication, manages study-relevant highlights. | v1 |
| **System Admin** | Deploys/operates the app on the VPS, manages users. | v1 |

> v1 assumption: **one shared repository of laws**, edited collaboratively by Law Administrators (a shared/canonical document set). v2: per-user personal edits/overlays on top of the shared canon.

---

## 3. Functional Requirements

### 3.1 Law content model & structure
- **FR-1** Represent legislation hierarchically: Law → Part/Title → Section (§ / paragraph) → sub-paragraph → letter/point.
- **FR-2** Each structural unit (whole law, paragraph/§, individual term/word) must be independently addressable so annotations, tags, comments, and links can attach to any of them.

### 3.2 Annotation, tagging, linking, comments
- **FR-3** **Tags** can be applied to: terms (words), paragraphs (§), and whole laws — i.e., at all levels.
- **FR-4** **Annotations** can be attached to terms and paragraphs.
- **FR-5** **Comments** can be attached to terms and paragraphs.
- **FR-6** **Linking ("link everything through everything"):** create links between any two addressable units (term↔term, term↔paragraph, paragraph↔law, cross-law references, etc.).
- **FR-7** Distinguish **shared/canonical** annotations (made by administrators, visible to all) from **personal** annotations (per user) — at least conceptually in v1, fully in v2.

### 3.3 Versioning
> v1 focus: **official amendments**, **consolidated text only**. *(per D2, D5)*
- **FR-8** Store each law as its **current consolidated text**; when an amendment takes effect, store a **new consolidated snapshot**. Keep the sequence of snapshots (effective date + amending-act reference as metadata) so history and diffs exist — but do **not** reconstruct or render individual amending acts.
- **FR-9** Highlight **which paragraph changed**, **how many times**, **when** (effective date), and **how** (diff between consecutive consolidated snapshots).
- **FR-10** Provide a visual diff / change indicator per paragraph; allow browsing previous consolidated snapshots and viewing the law "as of" a given date.
- **FR-10a** Paragraphs carry **stable identifiers** across snapshots so diffs and annotations survive renumbering. *(enabler)*
- *(Deferred to later phase: editorial-change history and annotation-change history.)*

### 3.4 Study aids
- **FR-11** **Exam/test highlights:** mark parts of laws that explicitly appear in specific tests/exams, backed by a **database of highlights per test** (e.g., "this § appears in Exam X"). v1: **manually curated by admins**. *(per D9)*
- **FR-12** Users can add their **own** highlights, tags, and links (personal study layer).
- **FR-13** Students can filter/view "what's relevant for test X."

### 3.5 Authoring / editorial workflow
- **FR-14** Import an official law PDF into the `/source` folder.
- **FR-15** Parse the PDF into a more digestible format (Markdown).
- **FR-16** Allow manual annotation/editing/cleanup of the parsed text to prepare it for students and lawyers.
- **FR-17** Publish the edited law to end users in **electronic form**.
- **FR-18** Produce a **paper version** of the same law.

### 3.6 Export & print
- **FR-19** Export laws into a format suitable for a **European printing company** to produce physical books.
- **FR-20** Electronic export/reading format for end users (web reading; possibly PDF/EPUB — TBD).

### 3.7 Search
- **FR-21** Full-text search across laws (and ideally annotations/tags).

### 3.8 Ingestion tool (separate app)
- **FR-22** Convert official Czech laws into Markdown (or similarly simple format). **Prefer structured sources** (LawGPT.cz proxy → eSbírka JSON → zakonyprolidi.cz; EUR-Lex XML for EU-origin law) when available; **fall back to PDF** parsing (+ optional OCR, rarely needed) + a Claude structure pass otherwise. *(per D1)*
- **FR-23** Designed to avoid repeated LLM cost — convert once, cache/reuse; only the PDF-fallback path needs an LLM structure pass.
- **FR-24** Mirror the exported clean Markdown to **git as a backup / source-versioning target**. PostgreSQL remains the live source of truth. *(per D6)*
- **FR-25** Operate as an independent application/pipeline that feeds the main app's `/source` workflow.
- **FR-26** Capture and preserve **amendment metadata** where the source provides it (effective dates, amending act references) to feed the official-amendment versioning model. *(supports D2)*

---

## 4. Non-Functional Requirements

- **NFR-1 Deployment:** Web app deployable to the stakeholder's own **VPS** (self-hosted, single-tenant initially).
- **NFR-2 Collaboration:** v1 supports concurrent editing of a shared law repository by administrators (shared-document semantics).
- **NFR-3 Localization:** Primary content is **Czech law** in **Czech**; UI language(s) TBD.
- **NFR-4 Performance:** Full-text search and paragraph-level rendering should stay responsive on large legal corpora.
- **NFR-5 Data longevity:** Source-of-truth content kept in open, simple, version-controllable formats (Markdown + git-friendly).
- **NFR-6 Reproducibility:** Conversion pipeline reproducible; conversions cached/stored, not re-run unnecessarily.

---

## 5. Recommended Technology Stack (proposal — to confirm)

> **Confirmed direction (D3):** Option A — **TypeScript main web app + separate Python ingestion tool.** Option B retained below for reference only.

The shape of this product (structured documents, paragraph-level addressing, full-text search, diffing/versioning, print export) points to a fairly conventional, well-supported stack:

### Option A — TypeScript app + Python ingestion *(SELECTED)*
- **Language/runtime:** TypeScript end-to-end (one language, large ecosystem).
- **Frontend:** React + Next.js (SSR for fast reading & SEO if ever public) or SvelteKit (lighter). Rich text/annotation via **ProseMirror/TipTap** (excellent for structured docs + inline annotations).
- **Backend:** Next.js API routes or a dedicated Node (NestJS/Fastify) service.
- **Database:** **PostgreSQL** — relational core for the structured model + JSONB for flexible annotation payloads.
- **Full-text search:** PostgreSQL full-text (with Czech config/`unaccent`) for v1; **Meilisearch/OpenSearch** if/when ranking & typo-tolerance matter.
- **Versioning of content:** store canonical Markdown in **git** (per FR-24) and/or row-level history tables in Postgres; paragraph diffs computed on stable paragraph IDs.
- **Print export:** Markdown → **Typst** or **LaTeX** → **PDF/X** (print-ready); or HTML+CSS Paged Media via **Paged.js**/**WeasyPrint**. Output a **print-ready PDF (PDF/X-1a or PDF/X-4)** which is the standard most EU printers accept.
- **Auth:** session-based, role-aware (Reader/Editor/Admin).
- **Deployment:** Docker Compose on the VPS (app + Postgres + search + reverse proxy/Caddy).

### Option B — Python-leaning (if the ingestion/LLM side dominates)
- Backend **FastAPI** (Python) — strongest ecosystem for PDF parsing & LLM tooling.
- Frontend still React/Svelte.
- Same Postgres + search + print-export choices.

### Ingestion tool (separate app)
- Python is the natural fit: PDF text/layout extraction (**pdfplumber / PyMuPDF / pdfminer**), optional OCR (**Tesseract / ocrmypdf**) for scanned PDFs, plus an **LLM pass** for structure recovery (headings, §, numbering) and cleanup. Outputs Markdown committed to a git-backed source repo.

> Recommendation: **Option A (TypeScript main app) + Python ingestion tool.** Keeps the interactive app in one language while using Python where it's strongest (PDF/LLM). Both share the Markdown + git source contract.

---

## 6. Proposed High-Level Architecture

```
[Official PDF] --> /source (raw)
      |
      v
[Ingestion app: extract + (OCR?) + LLM structure pass]
      |
      v
[Clean Markdown]  --(git commit)-->  [Source repo / version history]
      |
      v
[Main web app: parse Markdown into structured model in Postgres]
      |
      +--> Reading UI (annotate / tag / link / comment / versions / study highlights)
      +--> Full-text search
      +--> Export: electronic (web/PDF/EPUB) + print-ready PDF/X for printer
```

---

## 7. Phasing (proposed)

- **v1 (MVP):** Ingestion of a few laws; shared canonical repo edited by admins; reading UI with tags/annotations/comments/links (shared layer); paragraph-level versioning + diff; full-text search; print-ready PDF export.
- **v2:** Per-user personal annotation/tag/link layer; test-highlight database & study views; EPUB/e-reader export; richer search.
- **v3:** Cross-law reference graph, public access / multi-tenant, collaboration features.

---

## 8. Open Questions (to refine requirements)

> Resolved round 1: #2→D1, #5→D2, #9→D4, #15→D3.
> Resolved round 2: #1→D7 (PoC = 91/2012 Sb.), #3→D5 (consolidated text only), #4→D8 (licensing not a concern), #6→D6 (git=backup, Postgres=truth), #8→D9 (admin-curated highlights), #16→D10 (Claude API, user key). eSbírka access → D11.
> Still open: #7 (shared-only vs per-user annotations in v1), #10 (book size/typography), #11 (electronic export format), #12 (user count / sign-up), #13 (UI languages), #14 (VPS specs).

### Content & legal source
1. **Scope:** Which laws first (e.g., specific codes), and roughly how many / how large for v1?
2. **Source availability:** Are PDFs the *only* source, or is structured data (e.g., XML/eSbírka/Sbírka zákonů, EUR-Lex) available for some laws? This drastically changes ingestion effort.
3. **Consolidated vs. amending acts:** Do you want consolidated "current text" versions, the amendment history, or both? (Affects the versioning model heavily.)
4. **Legal/licensing:** Any constraints on redistributing law text and selling printed books?

### Versioning semantics
5. Should versioning track **official legislative changes over time** (amendments to the law itself), **editorial changes** (admin edits to the prepared text), **user annotation history**, or all three as separate axes?
6. Is **git** the intended source-of-truth store, or just a backup/export target, with Postgres as the live store?

### Annotations & study layer
7. For v1, are annotations/tags/comments **shared (single canonical set)** only, or do you already need per-user separation?
8. Where does the **test-highlight database** come from — manually curated by admins, imported from somewhere, or crowd-sourced?

### Export & print
9. Do you have a **target printing company** (or spec) already? Knowing their accepted format (PDF/X variant, page size, bleed, color profile) lets me target it precisely.
10. Page format expectations: book size (A5? B5?), typography, table of contents, indexes, marginalia for annotations?
11. Electronic end-user format: web-only, or also **PDF / EPUB** download?

### Users & access
12. Roughly how many users (readers/editors) for v1? Public sign-up or invite-only?
13. Languages for the **UI** (Czech only, or Czech + English)?

### Operational
14. VPS specs / OS, and do you want **Docker**-based deployment?
15. Any preference or constraint on the **language stack** (existing skills, team familiarity)?
16. Which **LLM/provider** for the ingestion pass, and is there a budget/privacy constraint (e.g., must run locally vs. cloud API)?
```
