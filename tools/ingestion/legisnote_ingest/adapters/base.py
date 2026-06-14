"""Adapter contract.

An adapter acquires a law from one source and returns the raw text plus
provenance. Normalization to the IR is shared (parse.czech_statute) for all
text-bearing sources; a truly structured adapter (eSbírka JSON) may instead
override and emit IR units directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from ..ir import SourceKind


@dataclass
class LawRef:
    """A law citation split into its parts, e.g. '91/2012' -> number=91, year=2012."""

    number: str
    year: int

    @property
    def citation(self) -> str:
        return f"{self.number}/{self.year} Sb."

    @classmethod
    def parse(cls, citation: str) -> "LawRef":
        cleaned = citation.replace("Sb.", "").strip()
        number, year = cleaned.split("/")
        return cls(number=number.strip(), year=int(year.strip()))


@dataclass
class AcquiredDoc:
    text: str
    source_kind: SourceKind
    url: str | None = None
    raw_bytes: bytes = b""
    meta: dict[str, str] = field(default_factory=dict)


class SourceAdapter(Protocol):
    source_kind: SourceKind

    def acquire(self, ref: LawRef) -> AcquiredDoc: ...
