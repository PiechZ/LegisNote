"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  type ImportActionResult,
  importFromLawGptAction,
  importManifestAction,
} from "~/server/actions/editorial";

const QUICK_PICKS: { citation: string; number: string; year: number; title: string }[] = [
  { citation: "89/2012", number: "89", year: 2012, title: "Občanský zákoník" },
  { citation: "40/2009", number: "40", year: 2009, title: "Trestní zákoník" },
  { citation: "262/2006", number: "262", year: 2006, title: "Zákoník práce" },
  { citation: "500/2004", number: "500", year: 2004, title: "Správní řád" },
];

function parseCitation(s: string): { number: string; year: number } | null {
  const m = /^\s*(\d+[a-z]?)\s*\/\s*(\d{4})/i.exec(s);
  if (!m) return null;
  return { number: m[1]!, year: Number(m[2]) };
}

export function ImportForm() {
  const [citation, setCitation] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ImportActionResult>) {
    startTransition(async () => setResult(await fn()));
  }

  function fetchFromLawGpt(input: string) {
    const parsed = parseCitation(input);
    if (!parsed) {
      setResult({ ok: false, error: "Zadejte citaci ve tvaru číslo/rok, např. 89/2012." });
      return;
    }
    run(() => importFromLawGptAction(parsed.number, parsed.year));
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      <section style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Z LawGPT.cz</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Načte konsolidované znění zákona přímo z LawGPT.cz a naimportuje ho jako koncept.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Citace, např. 121/2000"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchFromLawGpt(citation);
            }}
            style={{ minWidth: "12rem" }}
          />
          <button type="button" disabled={pending || !citation.trim()} onClick={() => fetchFromLawGpt(citation)}>
            {pending ? "Načítám…" : "Načíst a importovat"}
          </button>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ opacity: 0.7, alignSelf: "center", fontSize: "0.9rem" }}>Rychlý výběr:</span>
          {QUICK_PICKS.map((q) => (
            <button
              key={q.citation}
              type="button"
              disabled={pending}
              title={q.title}
              onClick={() => {
                setCitation(q.citation);
                run(() => importFromLawGptAction(q.number, q.year));
              }}
            >
              {q.citation} · {q.title}
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Z manifestu</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Nahrajte nebo vložte <code>manifest.json</code> z ingestního nástroje.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder='{ "manifestVersion": "1.0", "law": { … }, "snapshot": { … }, "units": [ … ] }'
          style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
        />
        <div>
          <button type="button" onClick={() => run(() => importManifestAction(text))} disabled={pending || !text.trim()}>
            {pending ? "Importuji…" : "Importovat manifest jako koncept"}
          </button>
        </div>
      </section>

      {result && !result.ok ? <p style={{ color: "crimson" }}>{result.error}</p> : null}
      {result && result.ok ? (
        <div style={{ borderLeft: "3px solid #2f9e44", paddingLeft: "0.75rem" }}>
          <p>
            ✅ Importováno: <strong>{result.titleCs ? `${result.titleCs} (${result.citation})` : result.citation}</strong> jako{" "}
            <strong>koncept</strong> — {result.unitsInserted} ustanovení ({result.nodesCreated} nových, {result.nodesMatched}{" "}
            navázaných).
          </p>
          <p>
            <Link href={`/law/${result.slug}/edit`}>Upravit a publikovat →</Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
