"""LawGPT.cz proxy adapter — JSON over eSbírka, no auth (PoC bootstrap).

Docs: https://lawgpt.cz/api-dokumentace  (see docs/research-czech-legislation-data.md §3.2)

Verified live (2026-06-14) against 91/2012 Sb.:
  - metadata:  GET /api/esbirka/laws/{number}/{year}
               -> {"data": {"title", "code", "staleUrl", "status", ...}}
  - full text: GET /api/esbirka/laws/{number}/{year}/fulltext?format=markdown
               -> {"data": {"format": "markdown", "content": "<statute text>"}}

`staleUrl` (e.g. "/sb/2012/91/2023-09-23") encodes the consolidated effective date.
"""

from __future__ import annotations

import httpx

from ..config import settings
from ..ir import SourceKind
from .base import AcquiredDoc, LawRef


class LawGptAdapter:
    source_kind: SourceKind = "lawgpt"

    def __init__(self, base_url: str | None = None, timeout: float = 30.0) -> None:
        self.base_url = (base_url or settings.lawgpt_base_url).rstrip("/")
        self.timeout = timeout

    def _law_url(self, ref: LawRef) -> str:
        return f"{self.base_url}/esbirka/laws/{ref.number}/{ref.year}"

    def acquire(self, ref: LawRef) -> AcquiredDoc:
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
            meta = _data(client.get(self._law_url(ref)))
            fulltext_url = f"{self._law_url(ref)}/fulltext"
            content = _data(client.get(fulltext_url, params={"format": "markdown"}))

        text = content.get("content")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("LawGPT fulltext response had no 'content'; verify the API.")

        doc_meta: dict[str, str] = {}
        if isinstance(meta.get("title"), str):
            doc_meta["title"] = meta["title"]
        eff = _effective_from(meta.get("staleUrl"))
        if eff:
            doc_meta["effectiveFrom"] = eff
        if isinstance(meta.get("code"), str):
            doc_meta["citation"] = meta["code"]

        return AcquiredDoc(
            text=text,
            source_kind=self.source_kind,
            url=f"{fulltext_url}?format=markdown",
            raw_bytes=text.encode("utf-8"),
            meta=doc_meta,
        )


def _data(resp: httpx.Response) -> dict:
    resp.raise_for_status()
    payload = resp.json()
    if not isinstance(payload, dict) or not payload.get("success", True):
        raise ValueError(f"LawGPT API error: {payload!r}")
    data = payload.get("data", payload)
    if not isinstance(data, dict):
        raise ValueError(f"Unexpected LawGPT response shape: {payload!r}")
    return data


def _effective_from(stale_url: object) -> str | None:
    """Extract the trailing YYYY-MM-DD from a staleUrl like '/sb/2012/91/2023-09-23'."""
    if not isinstance(stale_url, str):
        return None
    tail = stale_url.rstrip("/").split("/")[-1]
    parts = tail.split("-")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        return tail
    return None
