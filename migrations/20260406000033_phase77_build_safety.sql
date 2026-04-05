-- ─── Phase 7.7: Build Safety Gate + Deploy Integrity ─────────────────────────
-- Migration: 20260406000033_phase77_build_safety
--
-- Changes:
--   1. Add build_health JSONB column to project_settings
--      Stores: { state, reason, changed_at, bad_commit_sha, responsible_task_id, consecutive_failures }
--      States: healthy | build_unhealthy | deploy_blocked | recovering
--
--   2. Add failure_category enum extension to tasks
--      New categories: build_safety_gate | protected_file_violation | vercel_build_failed
--
-- Usage:
--   Paste into Supabase SQL Editor and run.
--   DO NOT run via admin migration routes (pg.Client always fails with Supabase).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add build_health column to project_settings if it doesn't exist
ALTER TABLE project_settings
  ADD COLUMN IF NOT EXISTS build_health JSONB DEFAULT NULL;

COMMENT ON COLUMN project_settings.build_health IS
  'Phase 7.7 WS4: Project build/deploy health state. '
  'Shape: { state: healthy|build_unhealthy|deploy_blocked|recovering, reason: string, '
  'changed_at: ISO timestamp, bad_commit_sha: string|null, responsible_task_id: uuid|null, '
  'consecutive_failures: number }. '
  'NULL = healthy (default). Updated by generate/route.ts and /api/webhooks/vercel.';

-- 2. Ensure failure_category column exists on tasks (already added in earlier migrations)
-- Only extend if using an enum; if it's plain text, no ALTER needed.
-- This is a no-op if the column already exists with text type.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS failure_category text DEFAULT NULL;

COMMENT ON COLUMN tasks.failure_category IS
  'Machine-readable failure reason. '
  'Values: commit_delivery | cross_project_target_mismatch | routing_missing | '
  'build_safety_gate | protected_file_violation | vercel_build_failed | '
  'qa_failed | blocked_preflight';

-- 3. Add index for health state lookups (used by WS6 guardrail checks)
-- Partial index: only rows where build_health is not null (healthy rows have NULL)
CREATE INDEX IF NOT EXISTS idx_project_settings_build_health
  ON project_settings ((build_health->>'state'))
  WHERE build_health IS NOT NULL;

-- 4. Verify the column was added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_settings' AND column_name = 'build_health'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: build_health column not found in project_settings after ALTER';
  END IF;
  RAISE NOTICE 'Phase 7.7 migration 033 applied successfully: build_health column exists in project_settings';
END $$;
