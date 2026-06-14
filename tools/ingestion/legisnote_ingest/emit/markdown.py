"""Render an IR unit tree to clean, human/git-friendly Markdown (D6, NFR-5)."""

from __future__ import annotations

from ..ir import Law, Snapshot, Unit

_HEADING_LEVEL = {"part": 1, "title": 2, "chapter": 3, "section": 4}


def render_markdown(law: Law, snapshot: Snapshot, units: list[Unit]) -> str:
    lines: list[str] = []
    lines.append(f"# {law.title_cs}")
    lines.append("")
    meta = [f"**{law.citation}**", f"účinné od {snapshot.effective_from}"]
    if snapshot.amending_act:
        meta.append(f"ve znění {snapshot.amending_act}")
    lines.append(" · ".join(meta))
    lines.append("")
    for u in units:
        _render_unit(u, lines)
    return "\n".join(lines).rstrip() + "\n"


def _render_unit(unit: Unit, lines: list[str]) -> None:
    if unit.node_type in _HEADING_LEVEL:
        if lines and lines[-1] != "":
            lines.append("")  # always separate a heading from preceding content
        level = _HEADING_LEVEL[unit.node_type]
        heading = unit.label or ""
        if unit.node_type == "section" and unit.text:
            # § heading text usually sits right after the § number.
            heading = f"{heading} — {unit.text.splitlines()[0]}"
        lines.append(f"{'#' * (level + 1)} {heading}".rstrip())
        lines.append("")
        if unit.node_type != "section" and unit.text:
            lines.append(unit.text)
            lines.append("")
    elif unit.node_type == "paragraph":
        body = unit.text or ""
        lines.append(f"**{unit.label}** {body}".rstrip())
        lines.append("")
    elif unit.node_type == "point":
        body = unit.text or ""
        lines.append(f"- {unit.label} {body}".rstrip())
    else:
        if unit.text:
            lines.append(unit.text)
            lines.append("")

    for child in unit.children:
        _render_unit(child, lines)
