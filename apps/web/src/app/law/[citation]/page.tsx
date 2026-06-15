import type { ReaderUnit } from "@legisnote/shared";
import Link from "next/link";

import { Reader } from "~/reader/Reader";
import type { ReaderOverlayCtx } from "~/reader/types";
import { auth } from "~/server/auth";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Slug like "91-2012" ⇄ law (number "91", year 2012). */
function parseSlug(slug: string): { number: string; year: number } | null {
  const m = /^(.+)-(\d{4})$/.exec(decodeURIComponent(slug));
  if (!m || !m[1] || !m[2]) return null;
  return { number: m[1], year: Number(m[2]) };
}

function unitLabel(u: ReaderUnit): string {
  const base = u.label?.trim();
  if (base) return base;
  const snippet = u.text?.trim().slice(0, 40);
  return snippet ? `${snippet}…` : u.nodeType;
}

function indexNodes(units: ReaderUnit[]): { nodes: { nodeId: string; label: string }[]; labelByNode: Record<string, string> } {
  const nodes: { nodeId: string; label: string }[] = [];
  const labelByNode: Record<string, string> = {};
  const walk = (list: ReaderUnit[]) => {
    for (const u of list) {
      const label = unitLabel(u);
      nodes.push({ nodeId: u.nodeId, label });
      labelByNode[u.nodeId] = label;
      walk(u.children);
    }
  };
  walk(units);
  return { nodes, labelByNode };
}

export default async function LawPage({
  params,
  searchParams,
}: {
  params: { citation: string };
  searchParams: { seq?: string; asOf?: string; exam?: string };
}) {
  const parsed = parseSlug(params.citation);
  const slug = params.citation;
  const seq = searchParams.seq ? Number(searchParams.seq) : undefined;
  const asOf = searchParams.asOf;
  const examId = searchParams.exam && UUID_RE.test(searchParams.exam) ? searchParams.exam : null;

  const session = await auth();
  const role = session?.user?.role;
  const isEditor = role === "editor" || role === "admin";
  const isAuthed = Boolean(session?.user);

  const caller = createCaller(await createContext());
  let doc: Awaited<ReturnType<typeof caller.law.getDocument>> = null;
  let ctx: ReaderOverlayCtx | null = null;
  let changeSet: Awaited<ReturnType<typeof caller.versioning.changeSet>> | null = null;
  let editorial: Awaited<ReturnType<typeof caller.editorial.snapshots>> = null;
  let dbError: string | null = null;

  if (parsed) {
    try {
      doc = await caller.law.getDocument({ number: parsed.number, year: parsed.year, seq, asOf });
      if (isEditor) {
        editorial = await caller.editorial.snapshots({ number: parsed.number, year: parsed.year });
      }
      if (doc) {
        const lawId = doc.law.id;

        const [overlayByNode, rangesByNode, change, exams, examHighlightByNode, myHighlightByNode] = await Promise.all([
          caller.overlay.forLaw({ lawId }),
          caller.overlay.rangesForLaw({ lawId }),
          caller.versioning.changeSet({ lawId, snapshotId: doc.snapshot.id }),
          caller.study.exams(),
          examId ? caller.study.examHighlightsForLaw({ lawId, examId }) : Promise.resolve({}),
          isAuthed ? caller.study.myHighlightsForLaw({ lawId }) : Promise.resolve({}),
        ]);

        changeSet = change;
        const { nodes, labelByNode } = indexNodes(doc.units);
        ctx = {
          overlayByNode,
          isEditor,
          isAuthed,
          slug,
          nodes,
          labelByNode,
          changeByNode: change.changeByNode,
          exams: exams.map((e) => ({ id: e.id, name: e.name })),
          currentExamId: examId,
          examHighlightByNode,
          myHighlightByNode,
          rangesByNode,
        };
      }
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  }

  const hasHistory = (changeSet?.snapshots.length ?? 0) > 1;
  const currentExam = ctx?.exams.find((e) => e.id === examId) ?? null;
  const examHitCount = ctx ? Object.keys(ctx.examHighlightByNode).length : 0;
  const draftCount = editorial?.snapshots.filter((s) => s.status === "draft").length ?? 0;
  const viewingDraft = doc?.snapshot.status === "draft";

  return (
    <main>
      <p>
        <Link href="/">← Zpět na seznam zákonů</Link>
      </p>

      {isEditor && parsed && editorial ? (
        <nav className="panelbar" style={{ display: "flex", gap: "0.85rem", alignItems: "center", flexWrap: "wrap" }}>
          <strong className="eyebrow">Editor</strong>
          <Link href={`/law/${slug}/edit`}>upravit text / publikovat →</Link>
          {draftCount > 0 ? (
            <span style={{ color: "#b45309" }}>
              {draftCount} {draftCount === 1 ? "nepublikovaný koncept" : "nepublikovaná znění (koncepty)"}
            </span>
          ) : (
            <span style={{ opacity: 0.7 }}>žádné koncepty</span>
          )}
        </nav>
      ) : null}

      {viewingDraft ? (
        <p className="panelbar" style={{ borderLeftColor: "#e8a317" }}>
          <strong>Náhled konceptu</strong> — toto znění není publikované a čtenáři ho nevidí.{" "}
          <Link href={`/law/${slug}/edit?seq=${doc!.snapshot.seq}`}>upravit a publikovat →</Link>
        </p>
      ) : null}

      {dbError ? (
        <p>
          Database not reachable. <small>({dbError})</small>
        </p>
      ) : !parsed ? (
        <p>
          Neplatná citace zákona: <code>{params.citation}</code>.
        </p>
      ) : !doc || !ctx || !changeSet ? (
        <p>Zákon nebyl nalezen nebo zatím nebyl publikován.</p>
      ) : (
        <>
          {hasHistory ? (
            <nav className="panelbar">
              <strong>Verze (znění):</strong>{" "}
              {changeSet.snapshots.map((s) => {
                const active = s.id === changeSet!.currentSnapshotId;
                return (
                  <span key={s.id} style={{ marginRight: "0.75rem" }}>
                    {active ? <strong>{s.effectiveFrom}</strong> : <Link href={`/law/${slug}?seq=${s.seq}`}>{s.effectiveFrom}</Link>}
                  </span>
                );
              })}
              <form method="get" action={`/law/${slug}`} style={{ display: "inline-flex", gap: "0.4rem", marginLeft: "0.5rem" }}>
                <label>
                  k datu: <input type="date" name="asOf" defaultValue={asOf ?? ""} />
                </label>
                <button type="submit">zobrazit</button>
              </form>
              {changeSet.currentSeq > 1 ? (
                <div style={{ marginTop: "0.4rem", opacity: 0.8 }}>
                  Změny oproti předchozímu znění jsou vyznačeny u jednotlivých ustanovení.
                  {changeSet.removedCount > 0 ? ` Odebráno ustanovení: ${changeSet.removedCount}.` : ""}
                </div>
              ) : null}
            </nav>
          ) : null}

          <nav className="panelbar">
            <form method="get" action={`/law/${slug}`} style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
              <label>
                <strong>Studijní zvýraznění:</strong>{" "}
                <select name="exam" defaultValue={examId ?? ""}>
                  <option value="">— bez filtru —</option>
                  {ctx.exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">zobrazit</button>
            </form>
            {currentExam ? (
              <span style={{ marginLeft: "0.75rem", opacity: 0.85 }}>
                Zvýrazněno pro <strong>{currentExam.name}</strong>: {examHitCount} ustanovení v tomto zákoně.
              </span>
            ) : null}
            <Link href="/exams" style={{ marginLeft: "0.75rem" }}>
              spravovat zkoušky →
            </Link>
          </nav>

          <nav className="panelbar">
            <strong>Export:</strong>{" "}
            <a href={`/api/export/${slug}?format=screen${seq ? `&seq=${seq}` : ""}${asOf ? `&asOf=${asOf}` : ""}`}>PDF (obrazovka)</a>
            {" · "}
            <a href={`/api/export/${slug}?format=print${seq ? `&seq=${seq}` : ""}${asOf ? `&asOf=${asOf}` : ""}`}>PDF (tisk)</a>
          </nav>

          <Reader doc={doc} ctx={ctx} />
        </>
      )}
    </main>
  );
}
