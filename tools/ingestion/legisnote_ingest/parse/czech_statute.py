"""Deterministic parser: Czech statute plain text / Markdown -> IR unit tree.

Recognises the standard Czech statutory hierarchy (docs/research-czech-legislation-data.md §6):

    Část (part)            ->  ČÁST PRVNÍ
    Hlava (title)          ->  HLAVA I
    Oddíl / Díl (chapter)  ->  Oddíl 1
    § (section)            ->  § 12   [optional heading on the next line]
    odstavec (paragraph)   ->  (1), (2)
    písmeno / bod (point)  ->  a), b) / 1.

This is the shared normalization step reused by every text-bearing adapter
(LawGPT Markdown, zakonyprolidi text, PDF-extracted text). It is a v1 heuristic
parser — good enough for the PoC (91/2012 Sb.) and unit-tested; refine as more
laws are ingested. Truly structured JSON sources (eSbírka) bypass this and map
fragments to IR directly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..ir import NodeType, Unit

# Hierarchy depth per node type (smaller = higher in the tree).
_DEPTH: dict[NodeType, int] = {
    "part": 1,
    "title": 2,
    "chapter": 3,
    "section": 4,
    "paragraph": 5,
    "point": 6,
}

_PART = re.compile(r"^#*\s*ČÁST\s+(.+)", re.IGNORECASE)
_TITLE = re.compile(r"^#*\s*HLAVA\s+(.+)", re.IGNORECASE)
_CHAPTER = re.compile(r"^#*\s*(?:Oddíl|Díl|Kapitola)\s+(.+)", re.IGNORECASE)
_SECTION = re.compile(r"^#*\s*§\s*(\d+[a-z]?)\b(.*)$")
_PARAGRAPH = re.compile(r"^\(\s*(\d+)\s*\)\s*(.*)$")
_POINT = re.compile(r"^([a-zA-Zľščřžýáíéúůňťďóě])\)\s*(.*)$")


@dataclass
class _Node:
    node_type: NodeType
    token: str  # key fragment, e.g. "s12", "o2", "pa", "cast1"
    label: str | None
    ordinal: int
    text_lines: list[str] = field(default_factory=list)
    children: list["_Node"] = field(default_factory=list)
    depth: int = 0

    def to_unit(self, key_prefix: str) -> Unit:
        node_key = f"{key_prefix}/{self.token}" if key_prefix else self.token
        text = "\n".join(self.text_lines).strip() or None
        return Unit(
            node_key=node_key,
            node_type=self.node_type,
            label=self.label,
            ordinal=self.ordinal,
            text=text,
            children=[c.to_unit(node_key) for c in self.children],
        )


def parse_czech_statute(text: str) -> list[Unit]:
    """Parse statute text into a tree of IR :class:`Unit` roots."""
    roots: list[_Node] = []
    stack: list[_Node] = []

    def _parent_for(depth: int) -> _Node | None:
        while stack and stack[-1].depth >= depth:
            stack.pop()
        return stack[-1] if stack else None

    def _attach(node: _Node) -> None:
        parent = _parent_for(node.depth)
        siblings = parent.children if parent else roots
        node.ordinal = len(siblings)
        siblings.append(node)
        stack.append(node)

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        if m := _PART.match(line):
            n = _Node("part", "", line, 0, depth=_DEPTH["part"])
            n.token = f"cast{_count(roots, 'part') + 1}"
            _attach(n)
        elif m := _TITLE.match(line):
            n = _Node("title", "", line, 0, depth=_DEPTH["title"])
            _attach(n)
            n.token = f"hlava{n.ordinal + 1}"
        elif m := _CHAPTER.match(line):
            n = _Node("chapter", "", line, 0, depth=_DEPTH["chapter"])
            _attach(n)
            n.token = f"oddil{n.ordinal + 1}"
        elif m := _SECTION.match(line):
            num = m.group(1)
            inline = m.group(2).strip()
            n = _Node("section", f"s{num}", f"§ {num}", 0, depth=_DEPTH["section"])
            if inline:
                n.text_lines.append(inline)
            _attach(n)
        elif m := _PARAGRAPH.match(line):
            num = m.group(1)
            rest = m.group(2)
            n = _Node("paragraph", f"o{num}", f"({num})", 0, depth=_DEPTH["paragraph"])
            if rest:
                n.text_lines.append(rest)
            _attach(n)
        elif m := _POINT.match(line):
            letter = m.group(1).lower()
            rest = m.group(2)
            n = _Node("point", f"p{letter}", f"{letter})", 0, depth=_DEPTH["point"])
            if rest:
                n.text_lines.append(rest)
            _attach(n)
        else:
            # Continuation text — belongs to the deepest open unit.
            if stack:
                stack[-1].text_lines.append(line)
            # Text before any structural marker (preamble) is dropped from the
            # body tree on purpose; the importer takes law title/preamble from
            # the manifest's `law` block.

    return [r.to_unit("") for r in roots]


def _count(nodes: list[_Node], node_type: NodeType) -> int:
    return sum(1 for n in nodes if n.node_type == node_type)
