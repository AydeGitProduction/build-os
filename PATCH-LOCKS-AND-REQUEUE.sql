-- ============================================================
-- PATCH: resource_locks CHECK constraint + stuck task re-queue
-- Apply via Supabase SQL Editor (NOT via admin migration routes)
-- Date: 2026-04-02
-- ============================================================

-- ─── 1. CHECK CONSTRAINT FIX ─────────────────────────────────────────────────
-- Migration 010 defined resource_type CHECK as:
--   ('schema','api_contract','workflow','document','task_group')
-- But all dispatch/lock code uses resource_type = 'task'.
-- If this constraint is still in place, every lock acquisition fails silently
-- (buildos_acquire_lock INSERT throws, caught as { acquired: false }).
--
-- Verify whether constraint exists first:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'resource_locks'::regclass
  AND conname = 'rl_resource_check';

-- If the above returns a row WITHOUT 'task' in the check list, run the fix:
ALTER TABLE resource_locks DROP CONSTRAINT IF EXISTS rl_resource_check;
ALTER TABLE resource_locks ADD CONSTRAINT rl_resource_check
  CHECK (resource_type IN ('schema', 'api_contract', 'workflow', 'document', 'task_group', 'task'));

-- ─── 2. VERIFY LOCK SYSTEM IS HEALTHY ────────────────────────────────────────
-- Check for any orphaned locks (resource_type='task', held on non-dispatched tasks)
SELECT rl.id, rl.resource_id, rl.locked_by_task_run, rl.expires_at, t.status AS task_status
FROM resource_locks rl
LEFT JOIN tasks t ON t.id = rl.resource_id
WHERE rl.resource_type = 'task'
ORDER BY rl.expires_at DESC;

-- Release any orphaned locks (held by tasks NOT in dispatched/in_progress status)
DELETE FROM resource_locks
WHERE resource_type = 'task'
  AND resource_id IN (
    SELECT id FROM tasks
    WHERE status NOT IN ('dispatched', 'in_progress')
  );

-- ─── 3. RE-QUEUE STUCK FAILED TASKS ─────────────────────────────────────────
-- Tasks that reached status='failed' due to QA max_retries exhaustion.
-- These were failing due to the G10 schema false positive bug (now fixed in 6c02ae1).
-- Reset them so they can run again with the fixed qa-evaluator.
--
-- First, PREVIEW which tasks would be reset:
SELECT id, title, status, retry_count, max_retries, updated_at
FROM tasks
WHERE status = 'failed'
  AND updated_at > NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC;

-- Then, reset them to ready (adjust the WHERE clause to target specific project/tasks):
-- WARNING: Only run after verifying the preview above shows the right tasks.
UPDATE tasks
SET
  status       = 'ready',
  retry_count  = 0,
  dispatched_at = NULL,
  updated_at   = NOW()
WHERE status = 'failed'
  AND updated_at > NOW() - INTERVAL '24 hours';
-- ↑ Scope to last 24h to avoid resetting old intentionally-failed tasks.
-- Narrow further with: AND project_id = '<your_project_id>'

-- ─── 4. VERIFY STATE AFTER RESET ─────────────────────────────────────────────
-- Check that tasks are now in ready status
SELECT status, COUNT(*) as count
FROM tasks
GROUP BY status
ORDER BY count DESC;

-- Confirm no locks are orphaned
SELECT COUNT(*) AS orphaned_locks
FROM resource_locks
WHERE resource_type = 'task'
  AND resource_id IN (
    SELECT id FROM tasks WHERE status NOT IN ('dispatched', 'in_progress')
  );
