"""Intermediate Representation (IR) + manifest models.

These pydantic models mirror packages/shared/schema/manifest.schema.json — the
cross-language contract consumed by the TypeScript importer (docs/architecture.md §8).
Field aliases use the JSON schema's camelCase names while the Python attributes stay
snake_case.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

MANIFEST_VERSION: Literal["1.0"] = "1.0"

NodeType = Literal[
    "law", "part", "title", "chapter", "section", "paragraph", "point", "sentence", "span"
]
SourceKind = Literal["esbirka_json", "lawgpt", "zakonyprolidi", "eurlex", "pdf"]


class _Model(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class Unit(_Model):
    node_key: str = Field(alias="nodeKey")
    node_type: NodeType = Field(alias="nodeType")
    label: str | None = Field(default=None, alias="label")
    ordinal: int = Field(alias="ordinal")
    text: str | None = Field(default=None, alias="text")
    children: list["Unit"] = Field(default_factory=list, alias="children")


class Law(_Model):
    citation: str
    number: str
    year: int
    title_cs: str = Field(alias="titleCs")
    short_title: str | None = Field(default=None, alias="shortTitle")


class Snapshot(_Model):
    seq: int = 1
    effective_from: str = Field(alias="effectiveFrom")
    effective_to: str | None = Field(default=None, alias="effectiveTo")
    amending_act: str | None = Field(default=None, alias="amendingAct")
    amending_meta: dict[str, Any] = Field(default_factory=dict, alias="amendingMeta")


class Source(_Model):
    kind: SourceKind | None = None
    url: str | None = None
    fetched_at: str | None = Field(default=None, alias="fetchedAt")
    raw_sha256: str | None = Field(default=None, alias="rawSha256")
    adapter_version: str | None = Field(default=None, alias="adapterVersion")
    llm_model: str | None = Field(default=None, alias="llmModel")


class Manifest(_Model):
    manifest_version: Literal["1.0"] = Field(default=MANIFEST_VERSION, alias="manifestVersion")
    law: Law
    snapshot: Snapshot
    source: Source | None = None
    units: list[Unit] = Field(default_factory=list)

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize using the JSON-schema (camelCase) field names."""
        data = self.model_dump(by_alias=True, exclude_none=False)
        if data.get("source") is None:
            data.pop("source", None)
        return data


Unit.model_rebuild()
