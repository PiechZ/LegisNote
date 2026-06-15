# legisnote-ingest

Converts official Czech laws into **clean Markdown + a validated `manifest.json`**
(the cross-language contract in `packages/shared`). Structured-first (D1): prefer the
LawGPT.cz proxy / eSbírka JSON; fall back to born-digital PDF + a Claude structure pass.

## Install

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"    # add ".[pdf]" for the PDF fallback
```

## Use

```bash
# Structured source (LawGPT.cz proxy — no auth needed):
legisnote-ingest ingest --citation 91/2012 \
  --title "Zákon o mezinárodním právu soukromém" --effective-from 2023-09-23

# Offline from a local text/Markdown file:
legisnote-ingest ingest --citation 91/2012 --title "…" \
  --effective-from 2023-09-23 --from-file source/raw/91-2012.md

# PDF fallback (needs the 'pdf' extra; --use-llm needs ANTHROPIC_API_KEY, D10):
legisnote-ingest ingest --citation 91/2012 --title "…" \
  --effective-from 2023-09-23 --source pdf --from-file source/pdf/91-2012.pdf --use-llm

# Mirror the clean Markdown to a git backup repo (FR-24) and stamp the commit
# SHA into the manifest (source.commit -> law_snapshot.source_commit):
legisnote-ingest ingest --citation 91/2012 --title "…" --effective-from 2023-09-23 \
  --git-mirror-dir /srv/legisnote-source-backup --push

# Push a reviewed manifest to the web importer:
legisnote-ingest import-manifest source/manifest/91-2012.json
```

> **Git backup mirror (FR-24, D6).** PostgreSQL is the live source of truth; git
> is a backup / source-versioning target. Pass `--git-mirror-dir` (or set
> `LEGISNOTE_GIT_MIRROR_DIR`) to a dedicated git working tree — the Markdown is
> committed there and the commit SHA travels in `manifest.source.commit`, which
> the importer persists as `law_snapshot.source_commit`. Mirroring is idempotent
> (identical content makes no new commit) and best-effort (a git failure is
> reported as a warning, not a hard error). Unset → mirroring is skipped so the
> pipeline never commits into the application repo by accident. `--no-mirror`
> forces it off even when the env var is set.

## How it works

```
adapter.acquire()  ->  raw text  ->  parse_czech_statute()  ->  IR unit tree
   (lawgpt | pdf)                      (deterministic)              |
                                                                   v
                              render_markdown()  +  build_manifest() [schema-validated]
                                       |                    |
                              source/md/*.md        source/manifest/*.json
```

- `parse/czech_statute.py` — deterministic parser for the Czech statutory hierarchy
  (ČÁST/HLAVA/Oddíl, §, odstavec `(n)`, písmeno `a)`). Assigns stable `nodeKey`s
  (`cast1/s1/o2/pa`) so identity survives renumbering (FR-10a).
- `cache/` — content-addressed cache so the expensive (LLM) path never re-runs (FR-23).
- `emit/manifest.py` — validates every manifest against the shared JSON schema before writing.

## Layout

```
legisnote_ingest/
  adapters/   lawgpt.py · pdf.py · base.py   (source acquisition)
  parse/      czech_statute.py               (text -> IR)
  emit/       markdown.py · manifest.py       (IR -> outputs)
  cache/      content-addressed cache
  importer/   POST manifest to the web app
  pipeline.py orchestration · cli.py entrypoint
tests/        parser + emitter + schema-validation tests
```

## Test & lint

```bash
pytest
ruff check legisnote_ingest
```
