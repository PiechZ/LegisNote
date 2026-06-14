import type { Manifest } from "@legisnote/shared";

/**
 * Token-authed importer endpoint consumed by the Python ingestion tool
 * (tools/ingestion → POST manifest.json). The web app owns the DB (D6); ingestion
 * never writes Postgres directly.
 *
 * STATUS: stub. Validates auth + manifest envelope. The actual upsert — creating
 * a law_snapshot, matching/assigning stable structural_node ids across snapshots,
 * and inserting snapshot_units — is the next implementation step (see
 * docs/data-model.md §2 for the stable-identity matching algorithm).
 */
export async function POST(req: Request): Promise<Response> {
  const expected = process.env.IMPORTER_TOKEN;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let manifest: Manifest;
  try {
    manifest = (await req.json()) as Manifest;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (manifest?.manifestVersion !== "1.0" || !manifest.law?.citation) {
    return Response.json({ error: "unrecognized manifest envelope" }, { status: 422 });
  }

  // TODO: implement the upsert (law → snapshot → stable nodes → units).
  return Response.json(
    {
      error: "not_implemented",
      message:
        "Manifest accepted and validated, but DB import is not yet implemented. " +
        "See docs/data-model.md §2 (stable-identity matching).",
      law: manifest.law.citation,
      units: manifest.units?.length ?? 0,
    },
    { status: 501 },
  );
}
