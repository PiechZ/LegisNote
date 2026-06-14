import Link from "next/link";

import { Reader } from "~/reader/Reader";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const dynamic = "force-dynamic";

/** Slug like "91-2012" ⇄ law (number "91", year 2012). */
function parseSlug(slug: string): { number: string; year: number } | null {
  const m = /^(.+)-(\d{4})$/.exec(decodeURIComponent(slug));
  if (!m || !m[1] || !m[2]) return null;
  return { number: m[1], year: Number(m[2]) };
}

export default async function LawPage({ params }: { params: { citation: string } }) {
  const parsed = parseSlug(params.citation);

  const caller = createCaller(createContext());
  let doc: Awaited<ReturnType<typeof caller.law.getDocument>> = null;
  let dbError: string | null = null;
  if (parsed) {
    try {
      doc = await caller.law.getDocument({ number: parsed.number, year: parsed.year });
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  }

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
      ) : !doc ? (
        <p>Zákon nebyl nalezen nebo zatím nebyl publikován.</p>
      ) : (
        <Reader doc={doc} />
      )}
    </main>
  );
}
