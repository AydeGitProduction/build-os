-- ============================================================
-- BUILD OS — Migration 013: Idempotency Keys
-- ============================================================

-- ─── idempotency_keys ────────────────────────────────────────────────────────
CREATE TABLE idempotency_keys (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key   text        NOT NULL,
  operation         text        NOT NULL,
  resource_id       uuid,
  project_id        uuid        NOT NULL,
  caller_id         text        NOT NULL,
  request_hash      text        NOT NULL,
  response_body     jsonb,
  status            text        NOT NULL DEFAULT 'pending',
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,

  CONSTRAINT ik_pkey      PRIMARY KEY (id),
  CONSTRAINT ik_proj_fk   FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT ik_key_op_uq UNIQUE (idempotency_key, operation),
  CONSTRAINT ik_status_ck CHECK (status IN ('pending','processing','completed','failed')),
  CONSTRAINT ik_op_check  CHECK (operation IN (
    'dispatch_task',
    'ingest_agent_output',
    'create_blocker',
    'submit_qa_verdict',
    'emit_cost_event',
    'emit_recommendation',
    'acquire_resource_lock',
    'connect_integration',
    'trigger_release'
  ))
);

CREATE INDEX idx_ik_key_op    ON idempotency_keys (idempotency_key, operation);
CREATE INDEX idx_ik_project   ON idempotency_keys (project_id);
CREATE INDEX idx_ik_expires   ON idempotency_keys (expires_at);
CREATE INDEX idx_ik_status    ON idempotency_keys (status) WHERE status IN ('pending','processing');

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
-- Service_role only — no user access to idempotency table
CREATE POLICY ik_select_never ON idempotency_keys FOR SELECT USING (false);
CREATE POLICY ik_insert_never ON idempotency_keys FOR INSERT WITH CHECK (false);
CREATE POLICY ik_update_never ON idempotency_keys FOR UPDATE USING (false);
CREATE POLICY ik_delete_never ON idempotency_keys FOR DELETE USING (false);

-- ─── Idempotency Check Function ───────────────────────────────────────────────
-- Returns: jsonb with {found: bool, cached_response: obj|null, status: text}
CREATE OR REPLACE FUNCTION buildos_check_idempotency(
  p_idempotency_key text,
  p_operation       text,
  p_project_id      uuid,
  p_caller_id       text,
  p_request_hash    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing idempotency_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_existing
  FROM idempotency_keys
  WHERE idempotency_key = p_idempotency_key
    AND operation = p_operation
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    -- New request — insert pending record and proceed
    INSERT INTO idempotency_keys (
      idempotency_key, operation, project_id, caller_id, request_hash, status
    ) VALUES (
      p_idempotency_key, p_operation, p_project_id, p_caller_id, p_request_hash, 'processing'
    );
    RETURN jsonb_build_object('found', false, 'status', 'new');
  END IF;

  -- Key exists — check status
  CASE v_existing.status
    WHEN 'completed' THEN
      -- Return cached response
      RETURN jsonb_build_object(
        'found', true,
        'status', 'completed',
        'cached_response', v_existing.response_body,
        'replayed', true
      );
    WHEN 'processing' THEN
      -- Still in flight — caller should wait and retry
      RETURN jsonb_build_object('found', true, 'status', 'processing');
    WHEN 'failed' THEN
      -- Previous attempt failed — reset to processing for retry
      UPDATE idempotency_keys
      SET status = 'processing', request_hash = p_request_hash, completed_at = NULL
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('found', false, 'status', 'retry_after_failure');
    WHEN 'pending' THEN
      -- Stale pending (should not happen normally) — reset
      UPDATE idempotency_keys SET status = 'processing' WHERE id = v_existing.id;
      RETURN jsonb_build_object('found', false, 'status', 'retry_stale');
    ELSE
      RETURN jsonb_build_object('found', false, 'status', 'unknown');
  END CASE;
END;
$$;

-- ─── Idempotency Complete Function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION buildos_complete_idempotency(
  p_idempotency_key text,
  p_operation       text,
  p_response_body   jsonb,
  p_success         boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_updated integer;
BEGIN
  UPDATE idempotency_keys
  SET
    status        = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    response_body = CASE WHEN p_success THEN p_response_body ELSE NULL END,
    completed_at  = now()
  WHERE idempotency_key = p_idempotency_key
    AND operation = p_operation
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ─── Duplicate Blocker Detection Function ────────────────────────────────────
-- Returns existing open blocker_id if duplicate detected within 5-minute window
CREATE OR REPLACE FUNCTION buildos_find_duplicate_blocker(
  p_task_id     uuid,
  p_blocker_type text
)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT id FROM blockers
  WHERE task_id = p_task_id
    AND blocker_type = p_blocker_type
    AND status = 'open'
    AND created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- ─── Consistency Check: QA Verdict ↔ Task Status Sync ───────────────────────
-- Detects and repairs tasks with QA verdicts but out-of-sync status
CREATE OR REPLACE FUNCTION buildos_sync_task_status_from_qa()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repaired integer := 0;
  v_rec record;
BEGIN
  -- Find tasks that have a PASS verdict but status is not completed
  FOR v_rec IN
    SELECT t.id AS task_id, qv.verdict
    FROM tasks t
    JOIN agent_outputs ao ON ao.task_id = t.id
    JOIN qa_verdicts qv ON qv.agent_output_id = ao.id
    WHERE qv.verdict = 'PASS'
      AND t.status NOT IN ('completed', 'cancelled')
    ORDER BY qv.created_at DESC
  LOOP
    UPDATE tasks SET status = 'completed', completed_at = now()
    WHERE id = v_rec.task_id AND status NOT IN ('completed','cancelled');
    IF FOUND THEN v_repaired := v_repaired + 1; END IF;
  END LOOP;

  -- Find tasks with FAIL verdict but status is not blocked
  FOR v_rec IN
    SELECT t.id AS task_id
    FROM tasks t
    JOIN agent_outputs ao ON ao.task_id = t.id
    JOIN qa_verdicts qv ON qv.agent_output_id = ao.id
    WHERE qv.verdict = 'FAIL'
      AND t.status NOT IN ('blocked', 'cancelled', 'completed')
    ORDER BY qv.created_at DESC
  LOOP
    UPDATE tasks SET status = 'blocked'
    WHERE id = v_rec.task_id AND status NOT IN ('blocked','cancelled','completed');
    IF FOUND THEN v_repaired := v_repaired + 1; END IF;
  END LOOP;

  RETURN v_repaired;
END;
$$;

-- ─── Expiry cleanup (register as pg_cron job) ─────────────────────────────────
-- SELECT cron.schedule('buildos-idempotency-cleanup', '0 * * * *',
--   $$DELETE FROM idempotency_keys WHERE expires_at < now()$$);
COMMENT ON TABLE idempotency_keys IS
  'Idempotency ledger. Service_role access only. '
  'Register pg_cron: DELETE FROM idempotency_keys WHERE expires_at < now() every hour.';
