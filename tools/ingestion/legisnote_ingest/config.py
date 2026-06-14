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


settings = Settings()
