"""Orchestrates acquire -> parse -> emit (-> git mirror) for one law snapshot."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from . import ADAPTER_VERSION
from .adapters.base import AcquiredDoc, LawRef
from .cache import cache_key, load_cached, save_cached
from .config import settings
from .emit import build_manifest, render_markdown, write_manifest
from .ir import Law, Snapshot, Source
from .mirror import MirrorError, mirror_markdown
from .parse import parse_czech_statute


@dataclass(frozen=True)
class BuildResult:
    md_path: Path
    manifest_path: Path
    commit: str | None  # git backup SHA (FR-24), or None if mirroring was off/failed
    mirror_warning: str | None  # set when mirroring was requested but failed


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
    git_mirror_dir: Path | None = None,
    git_mirror_push: bool = False,
) -> BuildResult:
    """Parse an acquired document and write the clean Markdown + manifest.

    When ``git_mirror_dir`` is given, the Markdown is also committed to that git
    backup repo (FR-24) and the resulting commit SHA is recorded in the manifest's
    ``source.commit``. Mirroring is best-effort: a git failure is captured in
    ``BuildResult.mirror_warning`` and degrades ``commit`` to ``None`` rather than
    discarding the rendered artifacts.
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

    markdown = render_markdown(law, snapshot, units)

    md_dir = out_md_dir or settings.md_dir
    manifest_dir = out_manifest_dir or settings.manifest_dir
    stem = f"{ref.number}-{ref.year}"

    md_dir.mkdir(parents=True, exist_ok=True)
    md_path = md_dir / f"{stem}.md"
    md_path.write_text(markdown, encoding="utf-8")

    # Git backup mirror (FR-24, D6) — commit the clean Markdown, stamp the SHA into
    # the manifest so the importer can persist law_snapshot.source_commit.
    commit: str | None = None
    mirror_warning: str | None = None
    if git_mirror_dir is not None:
        try:
            commit = mirror_markdown(
                mirror_dir=git_mirror_dir,
                rel_path=f"md/{stem}.md",
                content=markdown,
                message=f"{ref.citation} — snapshot seq {seq} (eff. {effective_from})",
                push=git_mirror_push,
            )
        except MirrorError as exc:
            mirror_warning = str(exc)

    source = Source(
        kind=doc.source_kind,
        url=doc.url,
        fetched_at=datetime.now(timezone.utc).isoformat(),
        raw_sha256=hashlib.sha256(raw).hexdigest(),
        adapter_version=ADAPTER_VERSION,
        llm_model=model_version,
        commit=commit,
    )

    manifest = build_manifest(law, snapshot, units, source)
    manifest_path = write_manifest(manifest, manifest_dir / f"{stem}.json")

    return BuildResult(
        md_path=md_path,
        manifest_path=manifest_path,
        commit=commit,
        mirror_warning=mirror_warning,
    )
