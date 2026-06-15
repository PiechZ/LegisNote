"use server";

import type { RangeSelector } from "@legisnote/shared";
import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";

import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

/** Study-aid mutations (FR-11/12/13) — delegate to the RBAC-guarded procedures. */
export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(slug: string | null, fn: (caller: Awaited<ReturnType<typeof getCaller>>) => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn(await getCaller());
    if (slug) revalidatePath(`/law/${slug}`);
    revalidatePath("/exams");
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

async function getCaller() {
  return createCaller(await createContext());
}

export async function createExamAction(name: string, description?: string): Promise<ActionResult> {
  return run(null, (c) => c.study.createExam({ name, description: description || undefined }));
}

export async function deleteExamAction(id: string): Promise<ActionResult> {
  return run(null, (c) => c.study.deleteExam({ id }));
}

export async function addExamHighlightAction(slug: string, examId: string, nodeId: string, note?: string): Promise<ActionResult> {
  return run(slug, (c) => c.study.addExamHighlight({ examId, nodeId, note: note || undefined }));
}

export async function removeExamHighlightAction(slug: string, examId: string, anchorId: string): Promise<ActionResult> {
  return run(slug, (c) => c.study.removeExamHighlight({ examId, anchorId }));
}

export async function toggleMyHighlightAction(slug: string, nodeId: string): Promise<ActionResult> {
  return run(slug, (c) => c.study.toggleMyHighlight({ nodeId }));
}

export async function addHighlightAction(
  slug: string,
  nodeId: string,
  selector?: RangeSelector,
  color?: string,
): Promise<ActionResult> {
  return run(slug, (c) => c.study.addHighlight({ nodeId, selector, color: color || undefined }));
}

export async function removeHighlightAction(slug: string, anchorId: string): Promise<ActionResult> {
  return run(slug, (c) => c.study.removeHighlight({ anchorId }));
}
