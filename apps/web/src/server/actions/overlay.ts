"use server";

import type { RangeSelector } from "@legisnote/shared";
import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";

import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

/**
 * Server actions invoked by the reader's client overlay panel. They delegate to
 * the RBAC-guarded tRPC procedures (editorProcedure enforces Editor/Admin via
 * the session), then revalidate the law page so the new overlay renders.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(slug: string, fn: (caller: Awaited<ReturnType<typeof getCaller>>) => Promise<unknown>): Promise<ActionResult> {
  try {
    const caller = await getCaller();
    await fn(caller);
    revalidatePath(`/law/${slug}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code === "UNAUTHORIZED" || e.code === "FORBIDDEN") {
        return { ok: false, error: "Nemáte oprávnění (vyžaduje roli editor/admin)." };
      }
      return { ok: false, error: e.message };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Neznámá chyba." };
  }
}

async function getCaller() {
  return createCaller(await createContext());
}

export async function addTagAction(
  slug: string,
  nodeId: string,
  name: string,
  color?: string,
  selector?: RangeSelector,
): Promise<ActionResult> {
  return run(slug, (c) => c.overlay.addTag({ nodeId, name, color: color || undefined, selector }));
}

export async function removeTagAction(slug: string, tagId: string, anchorId: string): Promise<ActionResult> {
  return run(slug, (c) => c.overlay.removeTag({ tagId, anchorId }));
}

export async function addAnnotationAction(
  slug: string,
  nodeId: string,
  text: string,
  selector?: RangeSelector,
): Promise<ActionResult> {
  return run(slug, (c) => c.overlay.addAnnotation({ nodeId, text, selector }));
}

export async function deleteAnnotationAction(slug: string, id: string): Promise<ActionResult> {
  return run(slug, (c) => c.overlay.deleteAnnotation({ id }));
}

export async function addCommentAction(slug: string, nodeId: string, body: string): Promise<ActionResult> {
  return run(slug, (c) => c.overlay.addComment({ nodeId, body }));
}

export async function deleteCommentAction(slug: string, id: string): Promise<ActionResult> {
  return run(slug, (c) => c.overlay.deleteComment({ id }));
}

export async function addLinkAction(slug: string, srcNodeId: string, dstNodeId: string, kind: string, label?: string): Promise<ActionResult> {
  return run(slug, (c) =>
    c.overlay.addLink({
      srcNodeId,
      dstNodeId,
      kind: kind as "reference" | "cross_law" | "definition" | "related" | "amends" | "see_also" | "custom",
      label: label || undefined,
    }),
  );
}

export async function deleteLinkAction(slug: string, id: string): Promise<ActionResult> {
  return run(slug, (c) => c.overlay.deleteLink({ id }));
}
