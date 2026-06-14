"""Orchestrates acquire -> parse -> emit for one law snapshot."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path

from . import ADAPTER_VERSION
from .adapters.base import AcquiredDoc, LawRef
from .cache import cache_key, load_cached, save_cached
from .config import settings
from .emit import build_manifest, render_markdown, write_manifest
from .ir import Law, Snapshot, Source
from .parse import parse_czech_statute


def build_outputs(
    *,
    ref: LawRef,
    doc: AcquiredDoc,
    title_cs: str,
    effective_from: str,
    short_title: str | None = None,
    amending_act: str | None = None,
    seq: int = 1,
    model_version: str | None = None,
    out_md_dir: Path | None = None,
    out_manifest_dir: Path | None = None,
) -> tuple[Path, Path]:
    """Parse an acquired document and write the clean Markdown + manifest.

    Returns ``(markdown_path, manifest_path)``.
    """
    raw = doc.raw_bytes or doc.text.encode("utf-8")

    # Content-addressed cache so the expensive path never re-runs (FR-23, NFR-6).
    key = cache_key(raw, ADAPTER_VERSION, model_version)
    if load_cached(key) is None:
        save_cached(key, doc.text)

    units = parse_czech_statute(doc.text)
    if not units:
        raise ValueError(
            f"Parser produced no structural units for '{title_cs}'. "
            "Check the source text / parser heuristics."
        )

    law = Law(
        citation=ref.citation,
        number=ref.number,
        year=ref.year,
        title_cs=title_cs,
        short_title=short_title,
    )
    snapshot = Snapshot(seq=seq, effective_from=effective_from, amending_act=amending_act)
    source = Source(
        kind=doc.source_kind,
        url=doc.url,
        fetched_at=datetime.now(timezone.utc).isoformat(),
        raw_sha256=hashlib.sha256(raw).hexdigest(),
        adapter_version=ADAPTER_VERSION,
        llm_model=model_version,
    )

    markdown = render_markdown(law, snapshot, units)
    manifest = build_manifest(law, snapshot, units, source)

    md_dir = out_md_dir or settings.md_dir
    manifest_dir = out_manifest_dir or settings.manifest_dir
    stem = f"{ref.number}-{ref.year}"

    md_dir.mkdir(parents=True, exist_ok=True)
    md_path = md_dir / f"{stem}.md"
    md_path.write_text(markdown, encoding="utf-8")

    manifest_path = write_manifest(manifest, manifest_dir / f"{stem}.json")
    return md_path, manifest_path
