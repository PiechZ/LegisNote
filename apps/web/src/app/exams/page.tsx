import Link from "next/link";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

import { ExamAdmin } from "./ExamAdmin";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const caller = createCaller(await createContext());

  let exams: { id: string; name: string; description: string | null; count: number }[] = [];
  let dbError: string | null = null;
  try {
    const rows = await caller.study.exams();
    exams = rows.map((e) => ({ id: e.id, name: e.name, description: e.description, count: e._count.highlights }));
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const session = await auth();
  const role = session?.user?.role;
  const isEditor = role === "editor" || role === "admin";

  return (
    <main>
      <p>
        <Link href="/">← LegisNote</Link>
      </p>
      <h1>Zkoušky (studijní zvýraznění)</h1>
      <p style={{ opacity: 0.8 }}>
        Zkoušky a jejich relevantní ustanovení (FR-11). Otevřete zákon a vyberte zkoušku ve „Studijním zvýraznění“, čímž
        zobrazíte, co je pro danou zkoušku relevantní (FR-13).
      </p>

      {dbError ? (
        <p>
          Databáze není dostupná. <small>({dbError})</small>
        </p>
      ) : (
        <ExamAdmin exams={exams} isEditor={isEditor} />
      )}
    </main>
  );
}
