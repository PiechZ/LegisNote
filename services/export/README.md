# Export / Print service (placeholder)

Renders a consolidated snapshot to print-ready and electronic formats
(docs/architecture.md §4). Planned toolchain:

- **Print-ready PDF (v1):** Typst → Ghostscript (PDF/X-1a, A5/B5) — D4.
- **Screen PDF:** same Typst pipeline, RGB profile.
- **EPUB (v2):** Pandoc.

Invoked as a pg-boss worker from the web app. Not implemented yet — this directory
reserves the workspace slot so the structure matches the architecture doc.
