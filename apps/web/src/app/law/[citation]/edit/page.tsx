import Link from "next/link";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

import { DraftEditor } from "./DraftEditor";

export const dynamic = "force-dynamic";

/** Slug like "91-2012" ⇄ law (number "91", year 2012). */
function parseSlug(slug: string): { number: string; year: number } | null {
  const m = /^(.+)-(\d{4})$/.exec(decodeURIComponent(slug));
  if (!m || !m[1] || !m[2]) return null;
  return { number: m[1], year: Number(m[2]) };
}

export default async function EditLawPage({
  params,
  searchParams,
}: {
  params: { citation: string };
  searchParams: { seq?: string };
}) {
  const slug = params.citation;
  const parsed = parseSlug(slug);

  const session = await auth();
  const role = session?.user?.role;
  const isEditor = role === "editor" || role === "admin";

  if (!isEditor) {
    return (
      <main>
        <p>
          <Link href={`/law/${slug}`}>← Zpět na zákon</Link>
        </p>
        <p>Editace vyžaduje roli editor/admin. <Link href="/login">Přihlásit se</Link></p>
      </main>
    );
  }
  if (!parsed) {
    return (
      <main>
        <p>Neplatná citace zákona: <code>{slug}</code>.</p>
      </main>
    );
  }

  const caller = createCaller(await createContext());
  const wantSeq = searchParams.seq ? Number(searchParams.seq) : undefined;

  let overview: Awaited<ReturnType<typeof caller.editorial.snapshots>> = null;
  let dbError: string | null = null;
  try {
    overview = await caller.editorial.snapshots({ number: parsed.number, year: parsed.year });
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  if (dbError) {
    return (
      <main>
        <p><Link href={`/law/${slug}`}>← Zpět na zákon</Link></p>
        <p>Databáze není dostupná. <small>({dbError})</small></p>
      </main>
    );
  }
  if (!overview || overview.snapshots.length === 0) {
    return (
      <main>
        <p><Link href={`/law/${slug}`}>← Zpět na zákon</Link></p>
        <p>Pro tento zákon zatím nebylo importováno žádné znění.</p>
      </main>
    );
  }

  // Pick the snapshot to edit: explicit ?seq → that one; else the latest draft;
  // else the latest snapshot overall.
  const target =
    (wantSeq != null ? overview.snapshots.find((s) => s.seq === wantSeq) : undefined) ??
    [...overview.snapshots].reverse().find((s) => s.status === "draft") ??
    overview.snapshots[overview.snapshots.length - 1]!;

  const doc = await caller.editorial.draftDocument({ snapshotId: target.id });

  return (
    <main>
      <p>
        <Link href={`/law/${slug}`}>← Zpět na zákon</Link>
      </p>
      <h1>Úprava textu — {doc.law.titleCs}</h1>
      <p style={{ opacity: 0.8 }}>
        {doc.law.citation}. Vyčistěte a upravte rozpoznaný text (FR-16), poté znění publikujte čtenářům (FR-17).
      </p>

      {overview.snapshots.length > 1 ? (
        <nav style={{ margin: "0.75rem 0", fontSize: "0.9rem" }}>
          <strong>Znění:</strong>{" "}
          {overview.snapshots.map((s) => (
            <span key={s.id} style={{ marginRight: "0.75rem" }}>
              {s.id === target.id ? (
                <strong>
                  #{s.seq} ({s.status === "published" ? "publ." : "koncept"})
                </strong>
              ) : (
                <Link href={`/law/${slug}/edit?seq=${s.seq}`}>
                  #{s.seq} ({s.status === "published" ? "publ." : "koncept"})
                </Link>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <DraftEditor slug={slug} snapshot={doc.snapshot} units={doc.units} />
    </main>
  );
}
