-- ============================================================
-- BUILD OS — PHASE 7.9  MIGRATION
-- Execution Lane Split: fast (n8n) vs heavy (inline worker)
-- ============================================================
-- Apply via Supabase SQL Editor (NOT pg.Client — pg.Client never works)
-- Idempotent: all statements use IF NOT EXISTS / DO NOTHING
-- ============================================================

-- WS1: Add execution_lane to tasks
-- 'fast'  = standard n8n dispatch (default)
-- 'heavy' = inline /api/worker/heavy (300s maxDuration, direct Claude call)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS execution_lane VARCHAR(10) DEFAULT 'fast';

-- Classify existing tasks:
-- All test tasks → heavy (test generation needs large LLM output)
UPDATE tasks
  SET execution_lane = 'heavy'
  WHERE task_type = 'test'
    AND (execution_lane IS NULL OR execution_lane = 'fast');

-- Schema tasks with migration/rls/audit/batch keywords → heavy
UPDATE tasks
  SET execution_lane = 'heavy'
  WHERE task_type = 'schema'
    AND (
      lower(title) LIKE '%migration%'
      OR lower(title) LIKE '%migrations%'
      OR lower(title) LIKE '%rls%'
      OR lower(title) LIKE '%policy%'
      OR lower(title) LIKE '%audit%'
      OR lower(title) LIKE '%seed%'
      OR lower(title) LIKE '%batch%'
    )
    AND (execution_lane IS NULL OR execution_lane = 'fast');

-- Any task type with heavy keywords in title → heavy
UPDATE tasks
  SET execution_lane = 'heavy'
  WHERE (
      lower(title) LIKE '%write tests%'
      OR lower(title) LIKE '%write test%'
      OR lower(title) LIKE '%integration test%'
      OR lower(title) LIKE '%schema migration%'
      OR lower(title) LIKE '%rls polic%'
      OR lower(title) LIKE '%security audit%'
      OR lower(title) LIKE '%audit rls%'
  )
  AND (execution_lane IS NULL OR execution_lane = 'fast');

-- WS6: Add observability columns to task_runs
-- executor_used: which executor ran this task ('n8n', 'inline', 'inline-heavy', 'mock')
-- runtime_ms:    wall-clock execution time in milliseconds
ALTER TABLE task_runs
  ADD COLUMN IF NOT EXISTS executor_used VARCHAR(20);

ALTER TABLE task_runs
  ADD COLUMN IF NOT EXISTS runtime_ms INTEGER;

-- Backfill executor_used for existing completed runs (assume n8n for historical)
UPDATE task_runs
  SET executor_used = 'n8n'
  WHERE executor_used IS NULL
    AND status IN ('completed', 'failed');

-- ============================================================
-- Verify
-- ============================================================
SELECT
  'tasks.execution_lane' AS check_name,
  count(*) FILTER (WHERE execution_lane = 'heavy') AS heavy_count,
  count(*) FILTER (WHERE execution_lane = 'fast' OR execution_lane IS NULL) AS fast_count,
  count(*) AS total_count
FROM tasks;

SELECT
  'task_runs.executor_used' AS check_name,
  executor_used,
  count(*) AS cnt
FROM task_runs
GROUP BY executor_used
ORDER BY cnt DESC;
