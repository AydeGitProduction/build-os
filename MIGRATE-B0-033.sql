-- ============================================================
-- MIGRATE-B0-033: Bootstrap State Machine
-- ============================================================
-- PASTE THIS IN SUPABASE SQL EDITOR:
-- https://supabase.com/dashboard/project/zyvpoyxdxedcugtdrluc/sql/new
--
-- Run ONCE. Fully idempotent (uses IF NOT EXISTS / DO blocks).
-- After running, verify with:
--   SELECT bootstrap_status FROM projects LIMIT 1;
-- ============================================================

-- 1. Add bootstrap_status column to projects (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'bootstrap_status'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN bootstrap_status text NOT NULL DEFAULT 'not_started'
      CHECK (bootstrap_status IN (
        'not_started', 'init', 'github_pending', 'github_ready',
        'vercel_pending', 'vercel_ready', 'linking', 'linked',
        'ready_for_architect', 'ready', 'failed'
      ));
    RAISE NOTICE 'Added bootstrap_status column to projects';
  ELSE
    RAISE NOTICE 'bootstrap_status column already exists — skipped';
  END IF;
END $$;

-- 2. Create bootstrap_log table (idempotent)
CREATE TABLE IF NOT EXISTS bootstrap_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step          text        NOT NULL,
  status        text        NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  detail        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bootstrap_log_project_id_idx ON bootstrap_log(project_id);
CREATE INDEX IF NOT EXISTS bootstrap_log_created_at_idx ON bootstrap_log(created_at DESC);

-- 3. RLS: only service_role can read/write bootstrap_log
ALTER TABLE bootstrap_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bootstrap_log' AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY service_role_all ON bootstrap_log FOR ALL TO service_role USING (true)';
    RAISE NOTICE 'Created RLS policy on bootstrap_log';
  END IF;
END $$;

-- 4. Verify
SELECT
  'projects.bootstrap_status' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'bootstrap_status'
  ) THEN 'OK' ELSE 'MISSING' END AS result

UNION ALL

SELECT
  'bootstrap_log table' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'bootstrap_log'
  ) THEN 'OK' ELSE 'MISSING' END AS result;
