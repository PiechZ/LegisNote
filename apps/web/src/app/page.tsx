import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const dynamic = "force-dynamic";

export default async function Home() {
  const caller = createCaller(createContext());

  let laws: Awaited<ReturnType<typeof caller.law.list>> = [];
  let dbError: string | null = null;
  try {
    laws = await caller.law.list();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main>
      <h1>LegisNote</h1>
      <p>Study and navigation tool for Czech legislation.</p>

      <h2>Laws</h2>
      {dbError ? (
        <p>
          Database not reachable yet. Run <code>pnpm db:up</code> and{" "}
          <code>pnpm --filter @legisnote/web db:pull &amp;&amp; pnpm --filter @legisnote/web db:generate</code>.
          <br />
          <small>({dbError})</small>
        </p>
      ) : laws.length === 0 ? (
        <p>
          No laws ingested yet. Use the ingestion tool:{" "}
          <code>legisnote-ingest ingest --citation 91/2012 …</code>
        </p>
      ) : (
        <ul>
          {laws.map((law) => (
            <li key={law.id}>
              <strong>{law.citation}</strong> — {law.titleCs}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
