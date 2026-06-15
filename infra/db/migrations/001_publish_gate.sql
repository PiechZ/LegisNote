-- Migration 001 — editorial publish gate (FR-16/17)
--
-- schema.sql is applied only on first init of the postgres volume. For an
-- already-initialized database, run this once:
--
--   docker compose exec -T postgres \
--     psql -U legisnote -d legisnote < infra/db/migrations/001_publish_gate.sql
--
-- Idempotent: safe to re-run (the one-time backfill only fires when the column
-- is first created, so re-running never demotes/promotes drafts).

DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'law_snapshot' AND column_name = 'status'
  ) INTO col_exists;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'snapshot_status') THEN
    CREATE TYPE snapshot_status AS ENUM ('draft','published');
  END IF;

  ALTER TABLE law_snapshot
    ADD COLUMN IF NOT EXISTS status snapshot_status NOT NULL DEFAULT 'draft';

  -- First-time backfill only: snapshots that predate the gate were live content,
  -- so mark them published to keep currently-rendering laws rendering. New
  -- imports created after this migration default to 'draft'.
  IF NOT col_exists THEN
    UPDATE law_snapshot SET status = 'published';
  END IF;
END $$;
