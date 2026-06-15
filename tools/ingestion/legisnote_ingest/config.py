"""Runtime configuration, read from environment (see infra/.env.example)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# Repo root = three levels up from this file (tools/ingestion/legisnote_ingest/).
REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or None
    esbirka_api_key: str | None = os.getenv("ESBIRKA_API_KEY") or None
    zakonyprolidi_api_key: str | None = os.getenv("ZAKONYPROLIDI_API_KEY") or None

    lawgpt_base_url: str = os.getenv("LAWGPT_BASE_URL", "https://lawgpt.cz/api")
    importer_url: str | None = os.getenv("LEGISNOTE_IMPORTER_URL") or None
    importer_token: str | None = os.getenv("LEGISNOTE_IMPORTER_TOKEN") or None

    # Output / cache locations (D6: clean Markdown mirrored to git under source/).
    source_dir: Path = REPO_ROOT / "source"
    md_dir: Path = REPO_ROOT / "source" / "md"
    manifest_dir: Path = REPO_ROOT / "source" / "manifest"
    cache_dir: Path = REPO_ROOT / "source" / "cache"

    # Git backup mirror of the clean Markdown (FR-24, D6). A dedicated git working
    # tree (e.g. a clone of a backup remote). Unset → mirroring is skipped so we
    # never commit into the application repo by accident. Set LEGISNOTE_GIT_MIRROR_PUSH
    # truthy to `git push` after each commit.
    git_mirror_dir: Path | None = (
        Path(os.environ["LEGISNOTE_GIT_MIRROR_DIR"]) if os.getenv("LEGISNOTE_GIT_MIRROR_DIR") else None
    )
    git_mirror_push: bool = os.getenv("LEGISNOTE_GIT_MIRROR_PUSH", "").lower() in {"1", "true", "yes", "on"}


settings = Settings()
