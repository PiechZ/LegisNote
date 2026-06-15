import Link from "next/link";

import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ExamDetailPage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return (
      <main>
        <p><Link href="/exams">← Zkoušky</Link></p>
        <p>Neplatný identifikátor zkoušky.</p>
      </main>
    );
  }

  const caller = createCaller(await createContext());
  let detail: Awaited<ReturnType<typeof caller.study.examDetail>> = null;
  let dbError: string | null = null;
  try {
    detail = await caller.study.examDetail({ examId: params.id });
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main>
      <p><Link href="/exams">← Zkoušky</Link></p>

      {dbError ? (
        <p>Databáze není dostupná. <small>({dbError})</small></p>
      ) : !detail ? (
        <p>Zkouška nebyla nalezena.</p>
      ) : (
        <>
          <h1>{detail.exam.name}</h1>
          {detail.exam.description ? <p style={{ opacity: 0.8 }}>{detail.exam.description}</p> : null}
          <p style={{ opacity: 0.7 }}>
            {detail.count === 0
              ? "Zatím nejsou označena žádná ustanovení."
              : `Označeno ustanovení: ${detail.count} v ${detail.laws.length} ${detail.laws.length === 1 ? "zákoně" : "zákonech"}.`}
          </p>

          {detail.laws.map((law) => (
            <section key={law.slug} style={{ margin: "1.25rem 0" }}>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                <Link href={`/law/${law.slug}?exam=${detail.exam.id}`}>{law.citation}</Link>
              </h2>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
                {law.items.map((it) => (
                  <li
                    key={it.nodeId}
                    style={{
                      borderLeft: "3px solid color-mix(in srgb, royalblue 55%, transparent)",
                      paddingLeft: "0.7rem",
                    }}
                  >
                    <Link href={`/law/${law.slug}#${it.nodeId}`}>
                      <strong>{it.label}</strong>
                    </Link>
                    {it.note ? <span style={{ opacity: 0.85 }}> — {it.note}</span> : null}
                    {it.snippet ? (
                      <div style={{ opacity: 0.65, fontSize: "0.9rem" }}>{it.snippet}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
