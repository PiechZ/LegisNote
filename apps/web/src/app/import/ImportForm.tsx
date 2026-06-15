"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { type ImportActionResult, importManifestAction } from "~/server/actions/editorial";

export function ImportForm() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function submit() {
    if (!text.trim()) return;
    startTransition(async () => {
      setResult(await importManifestAction(text));
    });
  }

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        <strong>Nahrát manifest.json</strong>
        <br />
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>

      <label>
        <strong>… nebo vložte obsah manifestu</strong>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder='{ "manifestVersion": "1.0", "law": { … }, "snapshot": { … }, "units": [ … ] }'
          style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
        />
      </label>

      <div>
        <button type="button" onClick={submit} disabled={pending || !text.trim()}>
          {pending ? "Importuji…" : "Importovat jako koncept"}
        </button>
      </div>

      {result && !result.ok ? <p style={{ color: "crimson" }}>{result.error}</p> : null}
      {result && result.ok ? (
        <div style={{ borderLeft: "3px solid #2f9e44", paddingLeft: "0.75rem" }}>
          <p>
            ✅ Importováno: <strong>{result.citation}</strong> jako <strong>koncept</strong> — {result.unitsInserted} ustanovení
            ({result.nodesCreated} nových, {result.nodesMatched} navázaných).
          </p>
          <p>
            <Link href={`/law/${result.slug}/edit`}>Upravit a publikovat →</Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
