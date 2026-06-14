"""LegisNote ingestion CLI.

Examples:
    # Fetch 91/2012 Sb. from LawGPT.cz (title + date auto-filled from API):
    legisnote-ingest ingest --citation 91/2012

    # Override title/date fetched from adapter:
    legisnote-ingest ingest --citation 91/2012 \\
        --title "Zákon o mezinárodním právu soukromém" --effective-from 2023-09-23

    # Parse a local file instead of fetching (title/date required manually):
    legisnote-ingest ingest --citation 91/2012 --title "..." \\
        --effective-from 2023-09-23 --from-file source/raw/91-2012.md

    # Push a manifest to the running web importer:
    legisnote-ingest import-manifest source/manifest/91-2012.json
"""

from __future__ import annotations

from pathlib import Path

import typer

from .adapters import LawGptAdapter
from .adapters.base import AcquiredDoc, LawRef
from .importer import import_manifest
from .pipeline import build_outputs

app = typer.Typer(add_completion=False, help="LegisNote ingestion pipeline.")


@app.command()
def ingest(
    citation: str = typer.Option(..., help="Law citation, e.g. '91/2012'."),
    title: str | None = typer.Option(None, "--title", help="Czech title (auto-filled from adapter if omitted)."),
    effective_from: str | None = typer.Option(None, help="Snapshot effective date YYYY-MM-DD (auto-filled from adapter if omitted)."),
    source: str = typer.Option("lawgpt", help="Source adapter: 'lawgpt' or 'pdf'."),
    from_file: Path | None = typer.Option(None, help="Parse this local text/MD/PDF file instead of fetching."),
    short_title: str | None = typer.Option(None, help="Optional short title."),
    amending_act: str | None = typer.Option(None, help="Amending act for this snapshot."),
    seq: int = typer.Option(1, help="Snapshot sequence number."),
    use_llm: bool = typer.Option(False, help="(pdf source) run the Claude structure pass (D10)."),
) -> None:
    """Acquire a law, parse it, and write clean Markdown + manifest under source/."""
    ref = LawRef.parse(citation)
    doc = _acquire(ref, source=source, from_file=from_file, use_llm=use_llm)

    resolved_title = title or doc.meta.get("title")
    resolved_effective_from = effective_from or doc.meta.get("effectiveFrom")

    if not resolved_title:
        raise typer.BadParameter(
            "Could not determine title from the adapter. Pass --title explicitly.",
            param_hint="'--title'",
        )
    if not resolved_effective_from:
        raise typer.BadParameter(
            "Could not determine effective date from the adapter. Pass --effective-from explicitly.",
            param_hint="'--effective-from'",
        )

    if not title and doc.meta.get("title"):
        typer.echo(f"[auto] title        : {resolved_title}")
    if not effective_from and doc.meta.get("effectiveFrom"):
        typer.echo(f"[auto] effective-from: {resolved_effective_from}")

    md_path, manifest_path = build_outputs(
        ref=ref,
        doc=doc,
        title_cs=resolved_title,
        effective_from=resolved_effective_from,
        short_title=short_title,
        amending_act=amending_act,
        seq=seq,
        model_version=(doc.meta.get("model") or None) if use_llm else None,
    )
    typer.echo(f"[ok] Markdown : {md_path}")
    typer.echo(f"[ok] Manifest : {manifest_path}")
    typer.echo("Next: review, then `legisnote-ingest import-manifest <manifest>`.")


@app.command("import-manifest")
def import_manifest_cmd(
    manifest: Path = typer.Argument(..., help="Path to a manifest.json."),
    url: str | None = typer.Option(None, help="Importer URL (else LEGISNOTE_IMPORTER_URL)."),
    token: str | None = typer.Option(None, help="Bearer token (else LEGISNOTE_IMPORTER_TOKEN)."),
) -> None:
    """POST a validated manifest to the web app's importer endpoint."""
    status = import_manifest(manifest, url=url, token=token)
    typer.echo(f"[ok] Imported ({status}).")


def _acquire(ref: LawRef, *, source: str, from_file: Path | None, use_llm: bool) -> AcquiredDoc:
    if from_file is not None:
        if from_file.suffix.lower() == ".pdf":
            from .adapters.pdf import PdfAdapter

            return PdfAdapter(from_file, use_llm=use_llm).acquire(ref)
        text = from_file.read_text(encoding="utf-8")
        return AcquiredDoc(text=text, source_kind="pdf" if source == "pdf" else "lawgpt", url=str(from_file))

    if source == "lawgpt":
        return LawGptAdapter().acquire(ref)
    if source == "pdf":
        raise typer.BadParameter("source='pdf' requires --from-file <path.pdf>.")
    raise typer.BadParameter(f"Unknown source '{source}'. Use 'lawgpt' or 'pdf'.")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
