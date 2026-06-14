import Link from "next/link";

import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const dynamic = "force-dynamic";

/** HTML-escape, then turn the search sentinels into <mark> (safe highlight). */
function renderSnippet(s: string | null): string {
  if (!s) return "";
  const escaped = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replaceAll("⟦H⟧", "<mark>").replaceAll("⟦/H⟧", "</mark>");
}

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim();

  const caller = createCaller(await createContext());
  let hits: Awaited<ReturnType<typeof caller.search.query>> = [];
  let dbError: string | null = null;
  if (q.length >= 2) {
    try {
      hits = await caller.search.query({ q });
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <main>
      <p>
        <Link href="/">← LegisNote</Link>
      </p>
      <h1>Hledání v zákonech</h1>

      <form action="/search" method="get" style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Hledaný výraz…"
          autoFocus
          style={{ flex: 1, font: "inherit", padding: "0.4rem 0.6rem" }}
        />
        <button type="submit">Hledat</button>
      </form>

      {dbError ? (
        <p>
          Vyhledávání není dostupné. <small>({dbError})</small>
        </p>
      ) : q.length < 2 ? (
        <p style={{ opacity: 0.7 }}>Zadejte alespoň dva znaky. Diakritika se ignoruje.</p>
      ) : hits.length === 0 ? (
        <p>
          Nic nenalezeno pro <strong>{q}</strong>.
        </p>
      ) : (
        <>
          <p style={{ opacity: 0.7 }}>
            {hits.length} výsledk{hits.length === 1 ? "" : hits.length < 5 ? "y" : "ů"} pro <strong>{q}</strong>
          </p>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "1rem" }}>
            {hits.map((h) => (
              <li key={`${h.slug}:${h.nodeId}`}>
                <Link href={`/law/${h.slug}#${h.nodeId}`}>
                  <strong>{h.label ?? h.nodeType}</strong> · {h.citation}
                </Link>
                {h.snippet ? (
                  <p
                    style={{ margin: "0.2rem 0 0", opacity: 0.85 }}
                    // Snippet is HTML-escaped above; only our <mark> tags remain.
                    dangerouslySetInnerHTML={{ __html: renderSnippet(h.snippet) }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
