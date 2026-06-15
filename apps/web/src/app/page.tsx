import Link from "next/link";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const dynamic = "force-dynamic";

/** "91/2012 Sb." → "91-2012" (reader route slug). */
function citationToSlug(citation: string): string {
  return citation
    .replace(/\s*Sb\.?\s*$/i, "")
    .trim()
    .replace(/\//g, "-");
}

export default async function Home() {
  const caller = createCaller(await createContext());

  let laws: Awaited<ReturnType<typeof caller.law.list>> = [];
  let exams: Awaited<ReturnType<typeof caller.study.exams>> = [];
  let dbError: string | null = null;
  try {
    [laws, exams] = await Promise.all([caller.law.list(), caller.study.exams()]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const session = await auth();
  const role = session?.user?.role;
  const isEditor = role === "editor" || role === "admin";

  return (
    <main>
      <section className="reveal" style={{ margin: "1rem 0 2.5rem", maxWidth: "46rem" }}>
        <p className="eyebrow">Studovna české legislativy</p>
        <h1 style={{ marginTop: "0.4rem" }}>
          Čtěte, anotujte a orientujte se v zákonech jako ve výborně vedené knize.
        </h1>
        <p className="muted" style={{ fontSize: "1.1rem" }}>
          Hierarchický text zákona, štítky a poznámky na úrovni slova i paragrafu, verze a změny v čase,
          studijní zvýraznění ke zkouškám a tisk.
        </p>

        <form action="/search" method="get" style={{ display: "flex", gap: "0.6rem", marginTop: "1.5rem", maxWidth: "32rem" }}>
          <input name="q" placeholder="Hledat v zákonech…" style={{ flex: 1 }} aria-label="Hledat v zákonech" />
          <button type="submit">Hledat</button>
        </form>
      </section>

      <hr className="rule" />

      {dbError ? (
        <p className="card">
          Databáze zatím není dostupná — spusťte lokální stack (<code>infra/local-up.sh</code>).
          <br />
          <small>({dbError})</small>
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
            gap: "1.5rem",
          }}
        >
          <section className="card reveal" style={{ animationDelay: "0.05s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>Zákony</h2>
              {isEditor ? <Link href="/import">+ přidat zákon</Link> : null}
            </div>
            <hr className="rule" style={{ margin: "0.9rem 0" }} />
            {laws.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Zatím žádné zákony.{" "}
                {isEditor ? <Link href="/import">Importovat →</Link> : "Zákony přidává editor."}
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.85rem" }}>
                {laws.map((law) => (
                  <li key={law.id}>
                    <Link href={`/law/${citationToSlug(law.citation)}`} style={{ color: "var(--ink)" }}>
                      <span className="eyebrow" style={{ display: "block" }}>{law.citation}</span>
                      <span style={{ fontFamily: "var(--font-display, Georgia), serif", fontSize: "1.15rem" }}>
                        {law.titleCs}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card reveal" style={{ animationDelay: "0.12s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>Zkoušky</h2>
              <Link href="/exams">spravovat →</Link>
            </div>
            <hr className="rule" style={{ margin: "0.9rem 0" }} />
            {exams.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Zatím žádné zkoušky.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.85rem" }}>
                {exams.map((ex) => (
                  <li key={ex.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "baseline" }}>
                    <Link href={`/exams/${ex.id}`} style={{ fontFamily: "var(--font-display, Georgia), serif", fontSize: "1.1rem" }}>
                      {ex.name}
                    </Link>
                    <small style={{ whiteSpace: "nowrap" }}>{ex._count.highlights} ust.</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
