"""LegisNote ingestion pipeline.

Czech laws -> Intermediate Representation (IR) -> clean Markdown + manifest.json,
then import to Postgres and mirror to git. See docs/architecture.md §3.
"""

__version__ = "0.1.0"
ADAPTER_VERSION = "0.1.0"
