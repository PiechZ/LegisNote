"""Push a validated manifest to the web app's token-authed importer endpoint.

The web app (apps/web) owns the database (D6). Ingestion never writes Postgres
directly; it POSTs the manifest and the importer assigns/links stable node ids.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from ..config import settings


def import_manifest(manifest_path: Path, *, url: str | None = None, token: str | None = None) -> int:
    url = url or settings.importer_url
    token = token or settings.importer_token
    if not url:
        raise RuntimeError(
            "No importer URL configured. Set LEGISNOTE_IMPORTER_URL (and "
            "LEGISNOTE_IMPORTER_TOKEN) or pass --url."
        )
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = httpx.post(url, json=payload, headers=headers, timeout=300.0)
    resp.raise_for_status()
    return resp.status_code
