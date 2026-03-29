-- ============================================================
-- BUILD OS — Migration 010: Resource Locking System
-- ============================================================

-- ─── resource_locks ──────────────────────────────────────────────────────────
CREATE TABLE resource_locks (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  resource_type       text        NOT NULL,
  resource_id         uuid        NOT NULL,
  lock_type           text        NOT NULL DEFAULT 'exclusive',
  locked_by_user      uuid,
  locked_by_agent     text,
  locked_by_task_run  uuid,
  acquired_at         timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  metadata            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rl_pkey            PRIMARY KEY (id),
  CONSTRAINT rl_resource_fk     FOREIGN KEY (locked_by_user)     REFERENCES users(id)      ON DELETE SET NULL,
  CONSTRAINT rl_task_run_fk     FOREIGN KEY (locked_by_task_run) REFERENCES task_runs(id)  ON DELETE CASCADE,
  CONSTRAINT rl_resource_check  CHECK (resource_type IN ('schema','api_contract','workflow','document','task_group')),
  CONSTRAINT rl_type_check      CHECK (lock_type IN ('exclusive','shared')),
  CONSTRAINT rl_holder_check    CHECK (
    locked_by_user IS NOT NULL
    OR locked_by_agent IS NOT NULL
    OR locked_by_task_run IS NOT NULL
  ),
  -- Only one exclusive lock per resource at a time (enforced by partial unique index)
  CONSTRAINT rl_expires_future  CHECK (expires_at > acquired_at)
);

-- Prevents two exclusive locks on the same resource
CREATE UNIQUE INDEX rl_exclusive_unique_idx
  ON resource_locks (resource_id)
  WHERE lock_type = 'exclusive';

-- Fast lookup by resource
CREATE INDEX idx_rl_resource     ON resource_locks (resource_id, lock_type);
-- Fast lookup by task run (for auto-release on completion)
CREATE INDEX idx_rl_task_run     ON resource_locks (locked_by_task_run) WHERE locked_by_task_run IS NOT NULL;
-- Fast expiry cleanup
CREATE INDEX idx_rl_expires      ON resource_locks (expires_at);

CREATE TRIGGER resource_locks_updated_at
  BEFORE UPDATE ON resource_locks
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE resource_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rl_select_member ON resource_locks FOR SELECT USING (
  resource_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT buildos_current_project_ids()))
  OR resource_id IN (SELECT buildos_current_project_ids())
);
CREATE POLICY rl_insert_never  ON resource_locks FOR INSERT WITH CHECK (false); -- service_role only
CREATE POLICY rl_update_admin  ON resource_locks FOR UPDATE USING (
  locked_by_user = auth.uid() OR buildos_current_user_role() IN ('owner','admin')
);
CREATE POLICY rl_delete_admin  ON resource_locks FOR DELETE USING (
  locked_by_user = auth.uid() OR buildos_current_user_role() IN ('owner','admin')
);

-- ─── Lock Acquisition Function ───────────────────────────────────────────────
-- Returns: jsonb with {success: bool, lock_id: uuid|null, conflict_info: obj|null}
CREATE OR REPLACE FUNCTION buildos_acquire_lock(
  p_resource_type   text,
  p_resource_id     uuid,
  p_lock_type       text DEFAULT 'exclusive',
  p_locked_by_user  uuid DEFAULT NULL,
  p_locked_by_agent text DEFAULT NULL,
  p_locked_by_run   uuid DEFAULT NULL,
  p_duration_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_lock resource_locks%ROWTYPE;
  v_new_lock_id   uuid;
  v_expires_at    timestamptz := now() + (p_duration_minutes || ' minutes')::interval;
BEGIN
  -- Check for conflicting lock (SELECT FOR UPDATE SKIP LOCKED for atomicity)
  SELECT * INTO v_existing_lock
  FROM resource_locks
  WHERE resource_id = p_resource_id
    AND expires_at > now()
    AND (
      lock_type = 'exclusive'
      OR p_lock_type = 'exclusive'
    )
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If we found a non-expired conflicting lock, return conflict info
  IF FOUND AND v_existing_lock.id IS NOT NULL THEN
    -- Check if caller already holds this exact lock (re-entrant — extend it)
    IF v_existing_lock.locked_by_task_run IS NOT NULL
       AND v_existing_lock.locked_by_task_run = p_locked_by_run THEN
      UPDATE resource_locks SET expires_at = v_expires_at WHERE id = v_existing_lock.id;
      RETURN jsonb_build_object(
        'success',   true,
        'lock_id',   v_existing_lock.id,
        'reentrant', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'conflict_info', jsonb_build_object(
        'lock_id',          v_existing_lock.id,
        'lock_type',        v_existing_lock.lock_type,
        'locked_by_agent',  v_existing_lock.locked_by_agent,
        'locked_by_task_run', v_existing_lock.locked_by_task_run,
        'expires_at',       v_existing_lock.expires_at
      )
    );
  END IF;

  -- No conflict — acquire the lock
  INSERT INTO resource_locks (
    resource_type, resource_id, lock_type,
    locked_by_user, locked_by_agent, locked_by_task_run,
    expires_at
  ) VALUES (
    p_resource_type, p_resource_id, p_lock_type,
    p_locked_by_user, p_locked_by_agent, p_locked_by_run,
    v_expires_at
  )
  RETURNING id INTO v_new_lock_id;

  RETURN jsonb_build_object(
    'success', true,
    'lock_id', v_new_lock_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- ─── Lock Release Function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION buildos_release_lock(
  p_resource_id   uuid,
  p_task_run_id   uuid DEFAULT NULL,
  p_lock_id       uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM resource_locks
  WHERE resource_id = p_resource_id
    AND (
      (p_lock_id IS NOT NULL AND id = p_lock_id)
      OR (p_task_run_id IS NOT NULL AND locked_by_task_run = p_task_run_id)
    );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$$;

-- ─── Auto-release trigger: release lock when task_run reaches terminal state ──
CREATE OR REPLACE FUNCTION buildos_auto_release_lock_on_run_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'timed_out') THEN
    DELETE FROM resource_locks WHERE locked_by_task_run = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_runs_auto_release_lock
  AFTER UPDATE OF status ON task_runs
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed', 'timed_out'))
  EXECUTE FUNCTION buildos_auto_release_lock_on_run_complete();

-- ─── Expiry cleanup (register as pg_cron job — apply after enabling pg_cron) ─
-- SELECT cron.schedule('buildos-lock-cleanup', '*/5 * * * *',
--   'DELETE FROM resource_locks WHERE expires_at < now()');
COMMENT ON TABLE resource_locks IS
  'Register pg_cron job: DELETE FROM resource_locks WHERE expires_at < now() every 5 minutes.';
