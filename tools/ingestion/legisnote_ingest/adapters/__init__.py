"""Source adapters, structured-first (D1). See docs/research-czech-legislation-data.md.

Priority order: lawgpt (no auth, PoC) -> esbirka (JSON, key later) ->
zakonyprolidi -> eurlex (EU-origin) -> pdf (fallback). Only lawgpt and pdf are
implemented in v1; the rest are registered stubs.
"""

from .base import AcquiredDoc, SourceAdapter
from .lawgpt import LawGptAdapter

ADAPTERS: dict[str, type] = {
    "lawgpt": LawGptAdapter,
}

__all__ = ["AcquiredDoc", "SourceAdapter", "LawGptAdapter", "ADAPTERS"]
