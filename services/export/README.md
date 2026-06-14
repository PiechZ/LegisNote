# Export / Print service

Renders a consolidated snapshot to print-ready and electronic formats
(docs/architecture.md §4). Toolchain:

- **Print-ready PDF (v1):** Typst → Ghostscript (`/prepress`). Strict PDF/X-1a
  CMYK is finalized against the chosen printer's ICC profile (D4).
- **Screen PDF:** Typst output as-is (RGB).
- **EPUB (v2):** Pandoc.

## v1 status — implemented inline in the web app

For v1 (single-VPS, low volume) export runs **synchronously inside the web app**,
not as a separate worker:

- `apps/web/src/server/export/typst.ts` — structured snapshot → Typst markup.
- `apps/web/src/app/api/export/[citation]/route.ts` — `GET ?format=screen|print`
  compiles with `typst` and (for print) post-processes with `gs`.
- Typst + Ghostscript are installed in `apps/web/Dockerfile`.

## Follow-up (deferred)

Extract this into a dedicated **pg-boss worker** in this directory when exports
become heavy/concurrent (architecture §1/§4): the web app enqueues a job, the
worker renders to MinIO, and the UI surfaces a download link. The web route above
is the reference implementation to lift.
