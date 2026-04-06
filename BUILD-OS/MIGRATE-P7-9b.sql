-- Migration: MIGRATE-P7-9b.sql
-- Purpose: Create heavy_dispatch_queue table for DB-backed async job dispatch
-- Idempotent: Yes (IF NOT EXISTS used throughout)
-- Rollback: DROP TABLE IF EXISTS heavy_dispatch_queue;

BEGIN;

-- =============================================================================
-- TABLE: heavy_dispatch_queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS heavy_dispatch_queue (
  id              uuid          PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  task_id         uuid          NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_run_id     uuid          NOT NULL,
  payload         jsonb         NOT NULL DEFAULT '{}'::jsonb,
  status          text          NOT NULL DEFAULT 'queued'
                                CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'dead')),
  attempt_count   integer       NOT NULL DEFAULT 0,
  max_attempts    integer       NOT NULL DEFAULT 3,
  scheduled_at    timestamptz   NOT NULL DEFAULT now(),
  locked_at       timestamptz   NULL,
  locked_by       text          NULL,
  completed_at    timestamptz   NULL,
  failed_at       timestamptz   NULL,
  last_error      text          NULL,
  idempotency_key text          UNIQUE NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Add table comment
COMMENT ON TABLE heavy_dispatch_queue IS 'DB-backed async job queue for heavy task dispatch with idempotency, retry, and dead-letter support';
COMMENT ON COLUMN heavy_dispatch_queue.task_id IS 'FK to tasks table — the logical task this dispatch belongs to';
COMMENT ON COLUMN heavy_dispatch_queue.task_run_id IS 'Unique identifier for this specific execution run (may map to task_runs table in future)';
COMMENT ON COLUMN heavy_dispatch_queue.payload IS 'Full JSON payload needed by the worker to execute this job';
COMMENT ON COLUMN heavy_dispatch_queue.status IS 'Job lifecycle: queued → processing → completed|failed|dead';
COMMENT ON COLUMN heavy_dispatch_queue.attempt_count IS 'Number of times this job has been attempted';
COMMENT ON COLUMN heavy_dispatch_queue.max_attempts IS 'Maximum retry attempts before escalating to dead status';
COMMENT ON COLUMN heavy_dispatch_queue.scheduled_at IS 'Earliest time this job should be picked up (enables delayed dispatch)';
COMMENT ON COLUMN heavy_dispatch_queue.locked_at IS 'Timestamp when a worker acquired this job (NULL = unlocked)';
COMMENT ON COLUMN heavy_dispatch_queue.locked_by IS 'Identifier of the worker/process that locked this job';
COMMENT ON COLUMN heavy_dispatch_queue.idempotency_key IS 'Unique key to prevent duplicate dispatch of the same logical operation';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary query path: poll for queued jobs ready to execute
CREATE INDEX IF NOT EXISTS idx_heavy_dispatch_queue_status_scheduled
  ON heavy_dispatch_queue (status, scheduled_at);

-- Lookup by parent task
CREATE INDEX IF NOT EXISTS idx_heavy_dispatch_queue_task_id
  ON heavy_dispatch_queue (task_id);

-- Lookup by run ID (for ACK/heartbeat correlation)
CREATE INDEX IF NOT EXISTS idx_heavy_dispatch_queue_task_run_id
  ON heavy_dispatch_queue (task_run_id);

-- Find jobs locked by a specific worker (for heartbeat monitoring)
CREATE INDEX IF NOT EXISTS idx_heavy_dispatch_queue_locked_by
  ON heavy_dispatch_queue (locked_by)
  WHERE locked_by IS NOT NULL;

-- Stale lock detection: find processing jobs by lock age
CREATE INDEX IF NOT EXISTS idx_heavy_dispatch_queue_status_locked
  ON heavy_dispatch_queue (status, locked_at)
  WHERE status = 'processing';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE heavy_dispatch_queue ENABLE ROW LEVEL SECURITY;

-- Service role (server-side workers, cron, API routes) gets full access
-- This is the primary access path — workers use service_role key
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'heavy_dispatch_queue' AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access"
      ON heavy_dispatch_queue
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Authenticated users can read dispatch records for tasks in their workspaces
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'heavy_dispatch_queue' AND policyname = 'authenticated_read_own_tasks'
  ) THEN
    CREATE POLICY "authenticated_read_own_tasks"
      ON heavy_dispatch_queue
      FOR SELECT
      USING (
        task_id IN (
          SELECT t.id
          FROM tasks t
          JOIN projects p ON t.project_id = p.id
          JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
          WHERE wm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMIT;