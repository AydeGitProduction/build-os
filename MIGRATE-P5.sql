-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATE-P5.sql — Phase 5: Base Scaffold Engine
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- What this adds:
--   1. projects.scaffold_committed_at  — timestamp set after scaffold commit
--   2. bootstrap_log.step enum update  — allows 'scaffold' + 'scaffolding' values
--
-- Safe to run multiple times (uses IF NOT EXISTS / DO $$ blocks).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add scaffold_committed_at to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS scaffold_committed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN projects.scaffold_committed_at IS
  'Phase 5: Timestamp when the base scaffold (package.json, next.config.mjs, etc.) was committed to the project GitHub repo. NULL = scaffold not yet run.';

-- 2. Extend bootstrap_status enum (if it is an enum type)
--    If bootstrap_status is just TEXT, this block is a no-op.
DO $$
BEGIN
  -- Only attempt enum add if the type exists and the value is missing
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'bootstrap_status_enum'
  ) THEN
    BEGIN
      ALTER TYPE bootstrap_status_enum ADD VALUE IF NOT EXISTS 'scaffolding';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE bootstrap_status_enum ADD VALUE IF NOT EXISTS 'scaffold_failed';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- 3. Index for quick lookup of un-scaffolded projects
CREATE INDEX IF NOT EXISTS idx_projects_scaffold_null
  ON projects (id)
  WHERE scaffold_committed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query — run after applying to confirm
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'projects'
  AND column_name = 'scaffold_committed_at';
