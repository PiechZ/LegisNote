"""Git backup mirror (FR-24)."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from legisnote_ingest.adapters.base import AcquiredDoc, LawRef
from legisnote_ingest.mirror import mirror_markdown
from legisnote_ingest.pipeline import build_outputs

SAMPLE = """\
§ 1
Předmět úpravy
(1) Tento zákon upravuje právní poměry s mezinárodním prvkem.
"""

_GIT = subprocess.run(["git", "--version"], capture_output=True).returncode == 0
requires_git = pytest.mark.skipif(not _GIT, reason="git not available")


@requires_git
def test_mirror_commits_and_is_idempotent(tmp_path: Path):
    mirror = tmp_path / "mirror"

    sha1 = mirror_markdown(
        mirror_dir=mirror, rel_path="md/91-2012.md", content="# Law\nbody\n", message="import 1"
    )
    assert len(sha1) == 40
    assert (mirror / "md" / "91-2012.md").read_text(encoding="utf-8") == "# Law\nbody\n"

    # Re-mirroring identical content makes no new commit.
    sha2 = mirror_markdown(
        mirror_dir=mirror, rel_path="md/91-2012.md", content="# Law\nbody\n", message="import 1 again"
    )
    assert sha2 == sha1

    # Changed content advances HEAD.
    sha3 = mirror_markdown(
        mirror_dir=mirror, rel_path="md/91-2012.md", content="# Law\nbody v2\n", message="import 2"
    )
    assert sha3 != sha1

    log = subprocess.run(
        ["git", "log", "--oneline"], cwd=mirror, capture_output=True, text=True
    ).stdout
    assert log.count("\n") == 2  # exactly two commits


@requires_git
def test_build_outputs_records_commit_in_manifest(tmp_path: Path):
    doc = AcquiredDoc(text=SAMPLE, source_kind="lawgpt", url="https://example/91-2012")
    result = build_outputs(
        ref=LawRef.parse("91/2012"),
        doc=doc,
        title_cs="Zákon o mezinárodním právu soukromém",
        effective_from="2023-09-23",
        out_md_dir=tmp_path / "md",
        out_manifest_dir=tmp_path / "manifest",
        git_mirror_dir=tmp_path / "mirror",
    )
    assert result.commit is not None and len(result.commit) == 40
    assert result.mirror_warning is None

    import json

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["source"]["commit"] == result.commit


def test_build_outputs_without_mirror_has_no_commit(tmp_path: Path):
    doc = AcquiredDoc(text=SAMPLE, source_kind="lawgpt")
    result = build_outputs(
        ref=LawRef.parse("91/2012"),
        doc=doc,
        title_cs="Zákon o mezinárodním právu soukromém",
        effective_from="2023-09-23",
        out_md_dir=tmp_path / "md",
        out_manifest_dir=tmp_path / "manifest",
    )
    assert result.commit is None
    assert result.mirror_warning is None
