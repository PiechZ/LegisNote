"""LawGPT.cz proxy adapter — JSON/Markdown over eSbírka, no auth (PoC bootstrap).

Docs: https://lawgpt.cz/api-dokumentace  (see docs/research-czech-legislation-data.md §3.2)

NOTE: the exact endpoint path and response shape should be verified against the
live API before production use — they are configurable here. The adapter accepts
either a Markdown/plaintext body or a JSON object containing a text field.
"""

from __future__ import annotations

import httpx

from ..config import settings
from ..ir import SourceKind
from .base import AcquiredDoc, LawRef

# Candidate text fields if the API returns JSON.
_JSON_TEXT_FIELDS = ("markdown", "text", "fulltext", "plaintext", "content")


class LawGptAdapter:
    source_kind: SourceKind = "lawgpt"

    def __init__(self, base_url: str | None = None, timeout: float = 30.0) -> None:
        self.base_url = (base_url or settings.lawgpt_base_url).rstrip("/")
        self.timeout = timeout

    def _url(self, ref: LawRef) -> str:
        # Mirrors the example from the research report:
        #   https://lawgpt.cz/api/esbirka/laws/sb/2012/91/fulltext
        return f"{self.base_url}/esbirka/laws/sb/{ref.year}/{ref.number}/fulltext"

    def acquire(self, ref: LawRef) -> AcquiredDoc:
        url = self._url(ref)
        resp = httpx.get(
            url,
            headers={"Accept": "text/markdown, application/json;q=0.9, text/plain;q=0.8"},
            timeout=self.timeout,
            follow_redirects=True,
        )
        resp.raise_for_status()
        text = _extract_text(resp)
        return AcquiredDoc(
            text=text,
            source_kind=self.source_kind,
            url=url,
            raw_bytes=resp.content,
        )


def _extract_text(resp: httpx.Response) -> str:
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type:
        data = resp.json()
        if isinstance(data, dict):
            for field_name in _JSON_TEXT_FIELDS:
                value = data.get(field_name)
                if isinstance(value, str) and value.strip():
                    return value
        raise ValueError(
            f"LawGPT JSON response had no recognized text field "
            f"(looked for {_JSON_TEXT_FIELDS}); verify the API shape."
        )
    return resp.text
