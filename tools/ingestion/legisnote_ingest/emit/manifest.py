"""Build, validate, and write the manifest.json contract artifact."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import jsonschema

from ..config import REPO_ROOT
from ..ir import Law, Manifest, Snapshot, Source, Unit

_SCHEMA_PATH = REPO_ROOT / "packages" / "shared" / "schema" / "manifest.schema.json"


@lru_cache(maxsize=1)
def _schema() -> dict[str, Any]:
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def build_manifest(
    law: Law, snapshot: Snapshot, units: list[Unit], source: Source | None = None
) -> Manifest:
    return Manifest(law=law, snapshot=snapshot, units=units, source=source)


def validate_manifest(manifest: Manifest) -> None:
    """Raise jsonschema.ValidationError if the manifest violates the shared contract."""
    jsonschema.validate(instance=manifest.to_json_dict(), schema=_schema())


def write_manifest(manifest: Manifest, path: Path) -> Path:
    validate_manifest(manifest)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest.to_json_dict(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path
