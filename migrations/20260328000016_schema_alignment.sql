-- ============================================================
-- BUILD OS — Migration 016: Schema Alignment
-- Fixes column gaps between API code and actual DB schema:
--
--   BUG-013: epics missing  slug, priority
--   BUG-014: features missing slug
--   BUG-015: tasks missing  slug, estimated_hours
--   BUG-016: GET /api/projects/[id]/tasks selects 'name' (not 'title')
--             — fixed in API code, not schema; listed here for traceability
-- ============================================================

-- ─── epics ────────────────────────────────────────────────────────────────────
ALTER TABLE epics
  ADD COLUMN IF NOT EXISTS slug     text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical','high','medium','low'));

-- Backfill slug from title for any existing rows
UPDATE epics
SET slug = lower(regexp_replace(
  regexp_replace(trim(title), '[^\w\s-]', '', 'g'),
  '[\s_]+', '-', 'g'
))
WHERE slug IS NULL;

-- Make slug NOT NULL after backfill, unique per project
ALTER TABLE epics
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS epics_project_slug_uq ON epics (project_id, slug);

-- ─── features ────────────────────────────────────────────────────────────────
ALTER TABLE features
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE features
SET slug = lower(regexp_replace(
  regexp_replace(trim(title), '[^\w\s-]', '', 'g'),
  '[\s_]+', '-', 'g'
))
WHERE slug IS NULL;

ALTER TABLE features
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS features_epic_slug_uq ON features (epic_id, slug);

-- ─── tasks ────────────────────────────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS slug             text,
  ADD COLUMN IF NOT EXISTS estimated_hours  numeric(6,2);

UPDATE tasks
SET slug = lower(regexp_replace(
  regexp_replace(trim(title), '[^\w\s-]', '', 'g'),
  '[\s_]+', '-', 'g'
))
WHERE slug IS NULL;

ALTER TABLE tasks
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_feature_slug_uq ON tasks (feature_id, slug);

-- ─── project_settings: add preview_url (P5: auto-preview) ────────────────────
ALTER TABLE project_settings
  ADD COLUMN IF NOT EXISTS preview_url text;

COMMENT ON COLUMN project_settings.preview_url IS
  'Deployment URL shown in the Preview tab iframe. Auto-populated from project_environments.deployment_url (production) when available.';
