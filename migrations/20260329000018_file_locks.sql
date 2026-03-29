-- ============================================================
-- BUILD OS — Migration 018: File Locks
-- ERT-P3 B1-BE Schema Closure
-- ============================================================
-- Distributed file locking for PatchEngine.
-- TTL-based: any lock with expires_at < now() is stale and
-- can be overwritten by a new acquirer.

-- ─── file_locks ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_locks (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  file_path   text        NOT NULL,
  task_id     uuid        NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '30 seconds',

  CONSTRAINT fl_pkey       PRIMARY KEY (id),
  CONSTRAINT fl_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fl_task_fk    FOREIGN KEY (task_id)    REFERENCES tasks(id)    ON DELETE CASCADE,
  -- One active lock per (project, file_path) at a time
  CONSTRAINT fl_unique_lock UNIQUE (project_id, file_path),
  CONSTRAINT fl_expires_future CHECK (expires_at > acquired_at)
);

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fl_project_file  ON file_locks (project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_fl_expires_at    ON file_locks (expires_at);
CREATE INDEX IF NOT EXISTS idx_fl_task_id       ON file_locks (task_id);

-- ─── Auto-cleanup: remove expired locks ──────────────────
-- Called periodically by orchestration tick or explicitly before lock acquire
CREATE OR REPLACE FUNCTION cleanup_expired_file_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM file_locks WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE file_locks ENABLE ROW LEVEL SECURITY;

-- Service role only — lock management is internal
CREATE POLICY "file_locks_service_role" ON file_locks
  FOR ALL USING (auth.role() = 'service_role');

-- Users can see locks on their own projects (read-only)
CREATE POLICY "fl_select" ON file_locks
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())
  );
