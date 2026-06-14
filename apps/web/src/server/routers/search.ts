import { Prisma } from "@prisma/client";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";

/**
 * Full-text search (FR-21) over the current consolidated text of each law (D5).
 * Uses the `cs_unaccent` config + generated `fts` tsvector / GIN index from
 * infra/db/schema.sql, so matching is diacritics-insensitive and case-folded.
 * Raw SQL because tsquery / ts_headline / ts_rank aren't expressible in Prisma.
 *
 * Highlight sentinels (⟦H⟧ … ⟦/H⟧) are placeholders: the client HTML-escapes the
 * snippet, then swaps them for <mark>, so law text can't inject markup.
 */
interface SearchRow {
  nodeId: string;
  label: string | null;
  nodeType: string;
  citation: string;
  number: string;
  year: number;
  snippet: string | null;
  rank: number;
}

export interface SearchHit {
  nodeId: string;
  label: string | null;
  nodeType: string;
  citation: string;
  slug: string;
  snippet: string | null;
}

export const searchRouter = router({
  query: publicProcedure
    .input(
      z.object({
        q: z.string().trim().max(200),
        lawId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ ctx, input }): Promise<SearchHit[]> => {
      if (input.q.length < 2) return [];

      const lawFilter = input.lawId ? Prisma.sql`AND l.id = ${input.lawId}::uuid` : Prisma.empty;

      const rows = await ctx.db.$queryRaw<SearchRow[]>`
        WITH q AS (SELECT websearch_to_tsquery('cs_unaccent', ${input.q}) AS query)
        SELECT su.node_id AS "nodeId",
               su.label,
               su.node_type AS "nodeType",
               l.citation,
               l.number,
               l.year,
               ts_headline('cs_unaccent', su.text, q.query,
                 'StartSel=⟦H⟧, StopSel=⟦/H⟧, MaxFragments=2, MaxWords=18, MinWords=4, FragmentDelimiter= … ') AS snippet,
               ts_rank(su.fts, q.query) AS rank
        FROM snapshot_unit su
        JOIN law_snapshot ls ON ls.id = su.snapshot_id
        JOIN law l ON l.id = ls.law_id AND l.current_snapshot_id = ls.id
        CROSS JOIN q
        WHERE su.fts @@ q.query
        ${lawFilter}
        ORDER BY rank DESC, su.path
        LIMIT ${input.limit}
      `;

      return rows.map((r) => ({
        nodeId: r.nodeId,
        label: r.label,
        nodeType: r.nodeType,
        citation: r.citation,
        slug: `${r.number}-${r.year}`,
        snippet: r.snippet,
      }));
    }),
});
