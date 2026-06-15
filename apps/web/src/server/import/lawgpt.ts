import type { Manifest } from "@legisnote/shared";

import { parseCzechStatute } from "./czechStatute";

/**
 * LawGPT.cz proxy client (TS port of tools/ingestion's LawGptAdapter). Fetches a
 * consolidated law's metadata + Markdown fulltext over the public eSbírka proxy
 * (no auth) and turns it into a draft import manifest. Mirrors the verified
 * endpoints in docs/research-czech-legislation-data.md §3.2.
 */

const BASE_URL = (process.env.LAWGPT_BASE_URL ?? "https://lawgpt.cz/api").replace(/\/+$/, "");

interface LawGptData {
  [k: string]: unknown;
}

async function getData(url: string): Promise<LawGptData> {
  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) throw new Error(`LawGPT ${resp.status} pro ${url}`);
  const payload = (await resp.json()) as Record<string, unknown>;
  if (payload && typeof payload === "object" && payload.success === false) {
    throw new Error(`LawGPT API error: ${JSON.stringify(payload)}`);
  }
  const data = (payload?.data ?? payload) as LawGptData;
  if (!data || typeof data !== "object") throw new Error(`Neočekávaná odpověď LawGPT pro ${url}`);
  return data;
}

/** Extract a trailing YYYY-MM-DD from a staleUrl like "/sb/2012/91/2023-09-23". */
function effectiveFrom(staleUrl: unknown): string | null {
  if (typeof staleUrl !== "string") return null;
  const tail = staleUrl.replace(/\/+$/, "").split("/").pop() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(tail) ? tail : null;
}

/** Fetch + parse one law from LawGPT into a draft import manifest. */
export async function fetchLawGptManifest(number: string, year: number): Promise<Manifest> {
  const lawUrl = `${BASE_URL}/esbirka/laws/${number}/${year}`;
  const [meta, fulltext] = await Promise.all([
    getData(lawUrl),
    getData(`${lawUrl}/fulltext?format=markdown`),
  ]);

  const content = fulltext.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("LawGPT nevrátil text zákona (prázdný 'content').");
  }

  const units = parseCzechStatute(content);
  if (units.length === 0) {
    throw new Error("Parser nerozpoznal žádná ustanovení — zkontrolujte zdrojový text.");
  }

  const titleCs = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : `Zákon č. ${number}/${year} Sb.`;
  const citation = typeof meta.code === "string" && meta.code.trim() ? meta.code.trim() : `${number}/${year} Sb.`;
  const eff = effectiveFrom(meta.staleUrl) ?? new Date().toISOString().slice(0, 10);

  return {
    manifestVersion: "1.0",
    law: { citation, number, year, titleCs },
    snapshot: { seq: 1, effectiveFrom: eff },
    source: {
      kind: "lawgpt",
      url: `${lawUrl}/fulltext?format=markdown`,
      fetchedAt: new Date().toISOString(),
    },
    units,
  };
}
