import type { Manifest } from "@legisnote/shared";

import { importManifest, isManifestEnvelope } from "~/server/import/manifest";

/**
 * Token-authed importer endpoint consumed by the Python ingestion tool
 * (tools/ingestion → POST manifest.json). The web app owns the DB (D6); ingestion
 * never writes Postgres directly. The shared upsert lives in
 * `~/server/import/manifest` (also used by the editor-gated web import).
 *
 * The snapshot lands as a DRAFT (FR-16/17): import never publishes.
 */

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.IMPORTER_TOKEN;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let manifest: unknown;
  try {
    manifest = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!isManifestEnvelope(manifest)) {
    return Response.json({ error: "unrecognized manifest envelope" }, { status: 422 });
  }

  try {
    const summary = await importManifest(manifest as Manifest);
    return Response.json({ ok: true, ...summary }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "import_failed", message }, { status: 500 });
  }
}
