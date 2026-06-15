"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";

import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

/** Editorial mutations (FR-16/17) — delegate to the RBAC-guarded procedures. */
export type ActionResult = { ok: true } | { ok: false; error: string };

async function getCaller() {
  return createCaller(await createContext());
}

async function run(
  slug: string,
  fn: (caller: Awaited<ReturnType<typeof getCaller>>) => Promise<unknown>,
): Promise<ActionResult> {
  try {
    await fn(await getCaller());
    revalidatePath(`/law/${slug}`);
    revalidatePath(`/law/${slug}/edit`);
    return { ok: true };
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code === "UNAUTHORIZED") return { ok: false, error: "Přihlaste se prosím." };
      if (e.code === "FORBIDDEN") return { ok: false, error: "Vyžaduje roli editor/admin." };
      return { ok: false, error: e.message };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Neznámá chyba." };
  }
}

export async function updateUnitTextAction(slug: string, unitId: string, text: string): Promise<ActionResult> {
  return run(slug, (c) => c.editorial.updateUnitText({ unitId, text }));
}

export async function publishSnapshotAction(slug: string, snapshotId: string): Promise<ActionResult> {
  return run(slug, (c) => c.editorial.publishSnapshot({ snapshotId }));
}

export async function unpublishSnapshotAction(slug: string, snapshotId: string): Promise<ActionResult> {
  return run(slug, (c) => c.editorial.unpublishSnapshot({ snapshotId }));
}

export type ImportActionResult =
  | { ok: true; slug: string; citation: string; status: string; unitsInserted: number; nodesCreated: number; nodesMatched: number }
  | { ok: false; error: string };

/** Import a pasted/uploaded manifest.json from the web UI (editor-gated). */
export async function importManifestAction(jsonText: string): Promise<ImportActionResult> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Neplatný JSON — zkontrolujte vložený text." };
  }
  try {
    const caller = await getCaller();
    const r = await caller.editorial.importManifest({ manifest });
    revalidatePath("/");
    revalidatePath(`/law/${r.slug}`);
    return {
      ok: true,
      slug: r.slug,
      citation: r.citation,
      status: r.status,
      unitsInserted: r.unitsInserted,
      nodesCreated: r.nodesCreated,
      nodesMatched: r.nodesMatched,
    };
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code === "UNAUTHORIZED") return { ok: false, error: "Přihlaste se prosím." };
      if (e.code === "FORBIDDEN") return { ok: false, error: "Vyžaduje roli editor/admin." };
      return { ok: false, error: e.message };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Import selhal." };
  }
}
