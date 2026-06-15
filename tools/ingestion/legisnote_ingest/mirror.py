"""Git mirror of the clean Markdown (FR-24, D6).

PostgreSQL is the live source of truth; git is a *backup / source-versioning*
target. After the pipeline renders a law's clean Markdown we commit it to a
dedicated git repository and capture the commit SHA, which travels in the
manifest (`source.commit`) so the importer can stamp `law_snapshot.source_commit`.

The mirror directory is a normal git working tree (typically a clone of a remote
backup repo). It is configured explicitly (settings / CLI); we never reach into
the application repo implicitly. Mirroring is best-effort from the caller's point
of view — failures raise :class:`MirrorError` and the pipeline degrades to
``commit=None`` rather than losing the rendered artifacts.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


class MirrorError(RuntimeError):
    """A git operation against the mirror repo failed."""


def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode != 0:
        cmd = " ".join(args)
        raise MirrorError(f"`git {cmd}` failed in {repo}: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def _ensure_repo(repo: Path) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    if not (repo / ".git").exists():
        _git(repo, "init", "-q")
    # Commits need an identity; set a local fallback only when none is configured
    # (respects an operator's global/local git identity if present).
    if _config_missing(repo, "user.email"):
        _git(repo, "config", "user.email", "ingestion@legisnote.local")
    if _config_missing(repo, "user.name"):
        _git(repo, "config", "user.name", "LegisNote Ingestion")


def _config_missing(repo: Path, key: str) -> bool:
    proc = subprocess.run(
        ["git", "config", "--get", key],
        cwd=repo,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return proc.returncode != 0 or not proc.stdout.strip()


def _has_staged_changes(repo: Path) -> bool:
    # `git diff --cached --quiet` exits 1 when there ARE staged changes.
    proc = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo)
    return proc.returncode == 1


def mirror_markdown(
    *,
    mirror_dir: Path,
    rel_path: str,
    content: str,
    message: str,
    push: bool = False,
) -> str:
    """Write ``content`` to ``mirror_dir/rel_path``, commit it, return the commit SHA.

    Idempotent: re-mirroring identical content makes no new commit and returns the
    existing HEAD. Raises :class:`MirrorError` on any git failure.
    """
    mirror_dir = Path(mirror_dir)
    _ensure_repo(mirror_dir)

    target = mirror_dir / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")

    _git(mirror_dir, "add", "--", rel_path)
    if _has_staged_changes(mirror_dir):
        _git(mirror_dir, "commit", "-q", "-m", message)

    sha = _git(mirror_dir, "rev-parse", "HEAD").strip()

    if push:
        _git(mirror_dir, "push")

    return sha
