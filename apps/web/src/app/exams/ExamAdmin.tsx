"use client";

import { useState, useTransition } from "react";

import { type ActionResult, createExamAction, deleteExamAction } from "~/server/actions/study";

interface ExamRow {
  id: string;
  name: string;
  description: string | null;
  count: number;
}

export function ExamAdmin({ exams, isEditor }: { exams: ExamRow[]; isEditor: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      setError(null);
      const res = await action();
      if (res.ok) onSuccess?.();
      else setError(res.error);
    });
  }

  return (
    <div>
      {isEditor ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            apply(() => createExamAction(name.trim(), description || undefined), () => {
              setName("");
              setDescription("");
            });
          }}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}
        >
          <input placeholder="Název zkoušky" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Popis (volitelné)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ flex: 1 }} />
          <button type="submit" disabled={pending}>+ vytvořit zkoušku</button>
        </form>
      ) : (
        <p style={{ opacity: 0.7 }}>Pro vytváření zkoušek se přihlaste jako editor/admin.</p>
      )}

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {exams.length === 0 ? (
        <p>Zatím žádné zkoušky.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
          {exams.map((ex) => (
            <li key={ex.id} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", justifyContent: "space-between" }}>
              <span>
                <strong>{ex.name}</strong>
                {ex.description ? ` — ${ex.description}` : ""}{" "}
                <small style={{ opacity: 0.7 }}>({ex.count} ustanovení)</small>
              </span>
              {isEditor ? (
                <button type="button" disabled={pending} onClick={() => apply(() => deleteExamAction(ex.id))}>
                  smazat
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
