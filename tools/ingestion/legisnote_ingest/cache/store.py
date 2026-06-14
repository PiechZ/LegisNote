"""Content-addressed cache so the expensive path never re-runs (FR-23, NFR-6).

Key = sha256(raw source bytes) + adapter version + (model/prompt version, if LLM).
v1 stores cache entries on the local filesystem under source/cache/; the production
deployment can back this with MinIO (docs/architecture.md §3.2).
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from ..config import settings


def cache_key(raw: bytes, adapter_version: str, model_version: str | None = None) -> str:
    h = hashlib.sha256()
    h.update(raw)
    h.update(b"\x00")
    h.update(adapter_version.encode())
    if model_version:
        h.update(b"\x00")
        h.update(model_version.encode())
    return h.hexdigest()


def _path(key: str) -> Path:
    return settings.cache_dir / f"{key}.json"


def load_cached(key: str) -> str | None:
    p = _path(key)
    return p.read_text(encoding="utf-8") if p.exists() else None


def save_cached(key: str, payload: str) -> Path:
    p = _path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(payload, encoding="utf-8")
    return p
