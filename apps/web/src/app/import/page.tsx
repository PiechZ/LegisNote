import Link from "next/link";

import { auth } from "~/server/auth";

import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await auth();
  const role = session?.user?.role;
  const isEditor = role === "editor" || role === "admin";

  return (
    <main>
      <p>
        <Link href="/">← LegisNote</Link>
      </p>
      <h1>Přidat zákon</h1>

      {!isEditor ? (
        <p>
          Import zákonů vyžaduje roli editor/admin. <Link href="/login">Přihlásit se</Link>
        </p>
      ) : (
        <>
          <p style={{ opacity: 0.85 }}>
            Vložte <code>manifest.json</code> vytvořený ingestním nástrojem
            (<code>legisnote-ingest ingest …</code>). Zákon se naimportuje jako <strong>koncept</strong> (FR-16/17);
            poté text upravíte a publikujete. Import je idempotentní — stejné znění (zákon + seq) lze nahrát opakovaně.
          </p>
          <ImportForm />
        </>
      )}
    </main>
  );
}
