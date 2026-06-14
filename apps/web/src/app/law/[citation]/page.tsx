import type { ReaderUnit } from "@legisnote/shared";
import Link from "next/link";

import { Reader } from "~/reader/Reader";
import type { ReaderOverlayCtx } from "~/reader/types";
import { auth } from "~/server/auth";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const dynamic = "force-dynamic";

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
  searchParams: { seq?: string; asOf?: string };
}) {
  const parsed = parseSlug(params.citation);
  const slug = params.citation;
  const seq = searchParams.seq ? Number(searchParams.seq) : undefined;
  const asOf = searchParams.asOf;

  const caller = createCaller(await createContext());
  let doc: Awaited<ReturnType<typeof caller.law.getDocument>> = null;
  let ctx: ReaderOverlayCtx | null = null;
  let changeSet: Awaited<ReturnType<typeof caller.versioning.changeSet>> | null = null;
  let dbError: string | null = null;

  if (parsed) {
    try {
      doc = await caller.law.getDocument({ number: parsed.number, year: parsed.year, seq, asOf });
      if (doc) {
        const [overlayByNode, change, session] = await Promise.all([
          caller.overlay.forLaw({ lawId: doc.law.id }),
          caller.versioning.changeSet({ lawId: doc.law.id, snapshotId: doc.snapshot.id }),
          auth(),
        ]);
        changeSet = change;
        const role = session?.user?.role;
        const { nodes, labelByNode } = indexNodes(doc.units);
        ctx = {
          overlayByNode,
          isEditor: role === "editor" || role === "admin",
          slug,
          nodes,
          labelByNode,
          changeByNode: change.changeByNode,
        };
      }
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  }

  const hasHistory = (changeSet?.snapshots.length ?? 0) > 1;

  return (
    <main>
      <p>
        <Link href="/">← Zpět na seznam zákonů</Link>
      </p>

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
            <nav style={{ margin: "1rem 0", padding: "0.75rem 1rem", border: "1px solid #8884", borderRadius: 8, fontSize: "0.9rem" }}>
              <strong>Verze (znění):</strong>{" "}
              {changeSet.snapshots.map((s) => {
                const active = s.id === changeSet!.currentSnapshotId;
                return (
                  <span key={s.id} style={{ marginRight: "0.75rem" }}>
                    {active ? (
                      <strong>{s.effectiveFrom}</strong>
                    ) : (
                      <Link href={`/law/${slug}?seq=${s.seq}`}>{s.effectiveFrom}</Link>
                    )}
                  </span>
                );
              })}
              <form method="get" action={`/law/${slug}`} style={{ display: "inline-flex", gap: "0.4rem", marginLeft: "0.5rem" }}>
                <label>
                  k datu:{" "}
                  <input type="date" name="asOf" defaultValue={asOf ?? ""} />
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

          <Reader doc={doc} ctx={ctx} />
        </>
      )}
    </main>
  );
}
