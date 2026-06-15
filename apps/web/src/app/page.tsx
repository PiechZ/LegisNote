import Link from "next/link";

import { AuthStatus } from "~/components/AuthStatus";
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
      <AuthStatus />
      <h1>LegisNote</h1>
      <p>Study and navigation tool for Czech legislation.</p>

      <form action="/search" method="get" style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}>
        <input
          name="q"
          placeholder="Hledat v zákonech…"
          style={{ flex: 1, font: "inherit", padding: "0.4rem 0.6rem" }}
        />
        <button type="submit">Hledat</button>
      </form>

      {dbError ? (
        <p>
          Database not reachable yet. Run the local stack (<code>infra/local-up.sh</code>).
          <br />
          <small>({dbError})</small>
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
            gap: "1.5rem",
            marginTop: "1rem",
          }}
        >
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2>Zákony</h2>
              {isEditor ? <Link href="/import">+ přidat zákon</Link> : null}
            </div>
            {laws.length === 0 ? (
              <p style={{ opacity: 0.75 }}>
                Zatím žádné zákony.{" "}
                {isEditor ? <Link href="/import">Importovat →</Link> : "Zákony přidává editor."}
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.4rem" }}>
                {laws.map((law) => (
                  <li key={law.id}>
                    <Link href={`/law/${citationToSlug(law.citation)}`}>
                      <strong>{law.citation}</strong> — {law.titleCs}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2>Zkoušky</h2>
              <Link href="/exams">spravovat →</Link>
            </div>
            {exams.length === 0 ? (
              <p style={{ opacity: 0.75 }}>Zatím žádné zkoušky.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.4rem" }}>
                {exams.map((ex) => (
                  <li key={ex.id}>
                    <Link href={`/exams/${ex.id}`}>
                      <strong>{ex.name}</strong>
                    </Link>{" "}
                    <small style={{ opacity: 0.7 }}>({ex._count.highlights} ustanovení)</small>
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
