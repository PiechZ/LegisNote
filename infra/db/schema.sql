-- LegisNote — initial database schema
-- Source of truth: docs/data-model.md (assembled here as a runnable DDL).
-- Applied automatically by the postgres container on first init (see docker-compose.yml).
-- PostgreSQL 16.

-- ---------------------------------------------------------------------------
-- Extensions & text-search configuration
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy match / re-anchoring
CREATE EXTENSION IF NOT EXISTS unaccent;   -- diacritics-insensitive FTS
CREATE EXTENSION IF NOT EXISTS ltree;      -- ordered tree paths per snapshot
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

-- Czech FTS config: snowball 'czech' stemmer + unaccent.
-- to_tsvector('cs_unaccent', ...) with a *constant* config is immutable, so it
-- is usable in the generated column and GIN index below.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'cs_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION cs_unaccent ( COPY = czech );
    ALTER TEXT SEARCH CONFIGURATION cs_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, czech_stem;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE node_type        AS ENUM
  ('law','part','title','chapter','section','paragraph','point','sentence','span');
CREATE TYPE anchor_status    AS ENUM ('ok','shifted','orphaned');
CREATE TYPE target_kind      AS ENUM ('node','snapshot_unit','range','law');
CREATE TYPE annotation_scope AS ENUM ('shared','personal');   -- v1 uses 'shared'
CREATE TYPE user_role        AS ENUM ('reader','editor','admin');
CREATE TYPE link_kind        AS ENUM
  ('reference','cross_law','definition','related','amends','see_also','custom');

-- ---------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext UNIQUE NOT NULL,
  display_name      text NOT NULL,
  password_hash     text,
  role              user_role NOT NULL DEFAULT 'reader',
  anthropic_key_enc bytea,           -- D10: user's own Claude API key (encrypted)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Laws, snapshots, stable nodes, snapshot units
-- ---------------------------------------------------------------------------
CREATE TABLE law (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  citation            text NOT NULL,    -- "91/2012 Sb."
  number              text NOT NULL,    -- "91"
  year                int  NOT NULL,    -- 2012
  title_cs            text NOT NULL,
  short_title         text,
  source_kind         text,             -- 'esbirka_json'|'lawgpt'|'zakonyprolidi'|'eurlex'|'pdf' (D1)
  current_snapshot_id uuid,             -- FK added after law_snapshot exists
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (number, year)
);

-- One consolidated version of a whole law (D5, FR-8).
CREATE TABLE law_snapshot (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_id          uuid NOT NULL REFERENCES law(id) ON DELETE CASCADE,
  seq             int  NOT NULL,        -- 1,2,3… ordering of consolidations
  effective_from  date NOT NULL,
  effective_to    date,                 -- NULL = currently in force
  amending_act    text,                 -- e.g. "zákon č. 285/2023 Sb." (metadata only, D5)
  amending_meta   jsonb NOT NULL DEFAULT '{}',  -- promulgation date, source refs (FR-26)
  source_commit   text,                 -- git commit of the Markdown backup (D6)
  imported_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (law_id, seq),
  UNIQUE (law_id, effective_from)
);

ALTER TABLE law
  ADD CONSTRAINT law_current_snapshot_fk
  FOREIGN KEY (current_snapshot_id) REFERENCES law_snapshot(id);

-- Stable, snapshot-independent logical identity of a structural unit (FR-10a).
CREATE TABLE structural_node (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_id                 uuid NOT NULL REFERENCES law(id) ON DELETE CASCADE,
  node_type              node_type NOT NULL,
  node_key               text,          -- semantic stable key from source / assigned
  first_seen_snapshot_id uuid REFERENCES law_snapshot(id),
  superseded_by_node_id  uuid REFERENCES structural_node(id), -- documented split/merge
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (law_id, node_key)
);

-- Content of one node within one snapshot (versioned text + numbering + position).
CREATE TABLE snapshot_unit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id    uuid NOT NULL REFERENCES law_snapshot(id) ON DELETE CASCADE,
  node_id        uuid NOT NULL REFERENCES structural_node(id) ON DELETE CASCADE,
  parent_unit_id uuid REFERENCES snapshot_unit(id) ON DELETE CASCADE,
  node_type      node_type NOT NULL,    -- denormalized for filtering
  label          text,                  -- "§ 5", "(2)", "a)", "Část druhá"
  ordinal        int  NOT NULL,         -- sort order among siblings
  path           ltree NOT NULL,        -- materialized ordinal path within snapshot
  text           text,                  -- own text (excludes children)
  text_hash      bytea,                 -- sha256(normalized text) — change detection
  fts            tsvector GENERATED ALWAYS AS
                   (to_tsvector('cs_unaccent', coalesce(text,''))) STORED,
  metadata       jsonb NOT NULL DEFAULT '{}',
  UNIQUE (snapshot_id, node_id)
);

CREATE INDEX snapshot_unit_snapshot_idx ON snapshot_unit (snapshot_id);
CREATE INDEX snapshot_unit_node_idx     ON snapshot_unit (node_id);
CREATE INDEX snapshot_unit_parent_idx   ON snapshot_unit (parent_unit_id);
CREATE INDEX snapshot_unit_path_idx     ON snapshot_unit USING gist (path);
CREATE INDEX snapshot_unit_fts_idx      ON snapshot_unit USING gin  (fts);
CREATE INDEX snapshot_unit_text_trgm_idx ON snapshot_unit USING gin (text gin_trgm_ops);
CREATE INDEX structural_node_law_type_idx ON structural_node (law_id, node_type);
CREATE INDEX law_snapshot_law_eff_idx     ON law_snapshot (law_id, effective_from);

-- ---------------------------------------------------------------------------
-- Diff cache (FR-9/10). The change indicator itself derives from text_hash;
-- this table only caches the rendered word/char diff.
-- ---------------------------------------------------------------------------
CREATE TABLE unit_diff (
  node_id          uuid NOT NULL REFERENCES structural_node(id) ON DELETE CASCADE,
  from_snapshot_id uuid NOT NULL REFERENCES law_snapshot(id) ON DELETE CASCADE,
  to_snapshot_id   uuid NOT NULL REFERENCES law_snapshot(id) ON DELETE CASCADE,
  change_type      text NOT NULL,       -- 'added'|'removed'|'modified'|'unchanged'
  diff             jsonb,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (node_id, from_snapshot_id, to_snapshot_id)
);

-- ---------------------------------------------------------------------------
-- Anchors, annotations, comments, tags (attach at any level — FR-3/4/5)
-- ---------------------------------------------------------------------------
CREATE TABLE anchor (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_id                 uuid NOT NULL REFERENCES law(id) ON DELETE CASCADE,
  node_id                uuid NOT NULL REFERENCES structural_node(id) ON DELETE CASCADE,
  selector               jsonb,         -- {quote,prefix,suffix,start,end}; NULL = whole unit
  created_in_snapshot_id uuid REFERENCES law_snapshot(id),
  anchor_status          anchor_status NOT NULL DEFAULT 'ok',
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anchor_node_idx ON anchor (node_id);

CREATE TABLE annotation (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_id  uuid NOT NULL REFERENCES anchor(id) ON DELETE CASCADE,
  scope      annotation_scope NOT NULL DEFAULT 'shared',  -- v2 seam (FR-7)
  owner_id   uuid REFERENCES app_user(id),                -- NULL = canonical; set in v2
  author_id  uuid REFERENCES app_user(id),
  body       jsonb NOT NULL,            -- TipTap/ProseMirror doc
  body_fts   tsvector,                  -- maintained by app/trigger (FR-21 stretch)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX annotation_scope_owner_idx ON annotation (scope, owner_id);
CREATE INDEX annotation_body_fts_idx    ON annotation USING gin (body_fts);

CREATE TABLE comment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_id  uuid NOT NULL REFERENCES anchor(id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES comment(id) ON DELETE CASCADE,  -- threads
  scope      annotation_scope NOT NULL DEFAULT 'shared',
  owner_id   uuid REFERENCES app_user(id),
  author_id  uuid REFERENCES app_user(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tag (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope    annotation_scope NOT NULL DEFAULT 'shared',
  owner_id uuid REFERENCES app_user(id),  -- NULL = shared/canonical
  name     text NOT NULL,
  color    text,
  UNIQUE (scope, owner_id, name)
);

CREATE TABLE tag_assignment (
  tag_id      uuid NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  anchor_id   uuid NOT NULL REFERENCES anchor(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, anchor_id)
);

-- ---------------------------------------------------------------------------
-- Links — generic "anything-to-anything" (FR-6)
-- ---------------------------------------------------------------------------
CREATE TABLE link (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_anchor_id uuid NOT NULL REFERENCES anchor(id) ON DELETE CASCADE,
  dst_anchor_id uuid NOT NULL REFERENCES anchor(id) ON DELETE CASCADE,
  kind          link_kind NOT NULL DEFAULT 'reference',
  directed      boolean NOT NULL DEFAULT true,
  scope         annotation_scope NOT NULL DEFAULT 'shared',
  owner_id      uuid REFERENCES app_user(id),
  label         text,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (src_anchor_id <> dst_anchor_id)
);
CREATE INDEX link_src_idx  ON link (src_anchor_id);
CREATE INDEX link_dst_idx  ON link (dst_anchor_id);
CREATE INDEX link_kind_idx ON link (kind);

-- ---------------------------------------------------------------------------
-- Study aids — tests & highlights (FR-11–13)
-- ---------------------------------------------------------------------------
CREATE TABLE exam (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Admin-curated (D9, FR-11), anchored to stable nodes so highlights survive amendments.
CREATE TABLE exam_highlight (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id    uuid NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
  anchor_id  uuid NOT NULL REFERENCES anchor(id) ON DELETE CASCADE,
  note       text,
  weight     int,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, anchor_id)
);
CREATE INDEX exam_highlight_exam_idx ON exam_highlight (exam_id);

-- Personal study highlights (FR-12).
CREATE TABLE user_highlight (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  anchor_id  uuid NOT NULL REFERENCES anchor(id) ON DELETE CASCADE,
  color      text,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, anchor_id)
);
