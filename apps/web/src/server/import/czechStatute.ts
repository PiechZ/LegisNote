import type { ManifestUnit, NodeType } from "@legisnote/shared";

/**
 * Deterministic Czech-statute parser (TS port of tools/ingestion's
 * parse/czech_statute.py) so the web app can import LawGPT Markdown directly.
 * Recognises ČÁST / HLAVA / Oddíl·Díl·Kapitola / § / (n) odstavec / a) písmeno
 * and assigns stable nodeKeys (cast1/s1/o2/pa) that survive renumbering (FR-10a).
 * Heuristic v1 — keep in sync with the Python parser as laws are added.
 */

const DEPTH: Record<string, number> = {
  part: 1,
  title: 2,
  chapter: 3,
  section: 4,
  paragraph: 5,
  point: 6,
};

const RE_PART = /^#*\s*ČÁST\s+(.+)/i;
const RE_TITLE = /^#*\s*HLAVA\s+(.+)/i;
const RE_CHAPTER = /^#*\s*(?:Oddíl|Díl|Kapitola)\s+(.+)/i;
const RE_SECTION = /^#*\s*§\s*(\d+[a-z]?)\b(.*)$/;
const RE_PARAGRAPH = /^\(\s*(\d+)\s*\)\s*(.*)$/;
const RE_POINT = /^([a-zA-Zľščřžýáíéúůňťďóě])\)\s*(.*)$/;

interface Node {
  nodeType: NodeType;
  token: string;
  label: string | null;
  ordinal: number;
  textLines: string[];
  children: Node[];
  depth: number;
}

function newNode(nodeType: NodeType, token: string, label: string | null, depth: number): Node {
  return { nodeType, token, label, ordinal: 0, textLines: [], children: [], depth };
}

function toUnit(node: Node, keyPrefix: string): ManifestUnit {
  const nodeKey = keyPrefix ? `${keyPrefix}/${node.token}` : node.token;
  const text = node.textLines.join("\n").trim() || null;
  return {
    nodeKey,
    nodeType: node.nodeType,
    label: node.label,
    ordinal: node.ordinal,
    text,
    children: node.children.map((c) => toUnit(c, nodeKey)),
  };
}

export function parseCzechStatute(text: string): ManifestUnit[] {
  const roots: Node[] = [];
  const stack: Node[] = [];

  const parentFor = (depth: number): Node | null => {
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    return stack.length ? stack[stack.length - 1]! : null;
  };

  const attach = (node: Node): void => {
    const parent = parentFor(node.depth);
    const siblings = parent ? parent.children : roots;
    node.ordinal = siblings.length;
    siblings.push(node);
    stack.push(node);
  };

  const countType = (nodes: Node[], t: NodeType): number => nodes.filter((n) => n.nodeType === t).length;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let m: RegExpMatchArray | null;
    if (RE_PART.test(line)) {
      const n = newNode("part", "", line, DEPTH.part!);
      n.token = `cast${countType(roots, "part") + 1}`;
      attach(n);
    } else if (RE_TITLE.test(line)) {
      const n = newNode("title", "", line, DEPTH.title!);
      attach(n);
      n.token = `hlava${n.ordinal + 1}`;
    } else if (RE_CHAPTER.test(line)) {
      const n = newNode("chapter", "", line, DEPTH.chapter!);
      attach(n);
      n.token = `oddil${n.ordinal + 1}`;
    } else if ((m = line.match(RE_SECTION))) {
      const num = m[1]!;
      const inline = (m[2] ?? "").trim();
      const n = newNode("section", `s${num}`, `§ ${num}`, DEPTH.section!);
      if (inline) n.textLines.push(inline);
      attach(n);
    } else if ((m = line.match(RE_PARAGRAPH))) {
      const num = m[1]!;
      const rest = m[2] ?? "";
      const n = newNode("paragraph", `o${num}`, `(${num})`, DEPTH.paragraph!);
      if (rest) n.textLines.push(rest);
      attach(n);
    } else if ((m = line.match(RE_POINT))) {
      const letter = m[1]!.toLowerCase();
      const rest = m[2] ?? "";
      const n = newNode("point", `p${letter}`, `${letter})`, DEPTH.point!);
      if (rest) n.textLines.push(rest);
      attach(n);
    } else if (stack.length) {
      // Continuation text belongs to the deepest open unit. Preamble before any
      // structural marker is dropped on purpose (title comes from the manifest).
      stack[stack.length - 1]!.textLines.push(line);
    }
  }

  return roots.map((r) => toUnit(r, ""));
}
