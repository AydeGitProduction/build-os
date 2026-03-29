-- ============================================================
-- BUILD OS — Migration 011: Audit & Trace System
-- ============================================================

-- ─── audit_logs ──────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  workspace_id    uuid,
  project_id      uuid,
  actor_id        text        NOT NULL,
  actor_type      text        NOT NULL,
  event_type      text        NOT NULL,
  resource_type   text        NOT NULL,
  resource_id     uuid,
  action          text        NOT NULL,
  before_state    jsonb,
  after_state     jsonb,
  ip_address      inet,
  user_agent      text,
  trace_id        uuid        NOT NULL DEFAULT gen_random_uuid(),
  metadata        jsonb       NOT NULL DEFAULT '{}',
  recorded_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT al_pkey           PRIMARY KEY (id),
  CONSTRAINT al_org_fk         FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT al_actor_check    CHECK (actor_type IN ('user','agent_runtime','automation_service','system')),
  CONSTRAINT al_action_check   CHECK (action IN ('create','read','update','delete','execute','approve','reject','rotate','lock','unlock')),
  CONSTRAINT al_event_check    CHECK (event_type IN (
    'TASK_DISPATCHED','TASK_COMPLETED','TASK_FAILED','TASK_BLOCKED',
    'QA_VERDICT_ISSUED',
    'RELEASE_APPROVED','RELEASE_DEPLOYED','RELEASE_ROLLED_BACK',
    'CREDENTIAL_ACCESS','CREDENTIAL_CREATED','CREDENTIAL_REVOKED','CREDENTIAL_DECRYPT_FAILED',
    'KEY_ROTATION','BREAK_GLASS',
    'LOCK_ACQUIRED','LOCK_RELEASED','LOCK_FORCE_RELEASED',
    'INTEGRATION_CONNECTED','INTEGRATION_FAILED',
    'COST_ALERT_TRIGGERED',
    'USER_ROLE_CHANGED','PROJECT_CREATED','PROJECT_ARCHIVED',
    'BLUEPRINT_ACCEPTED','RELEASE_GATE_PASSED','RELEASE_GATE_FAILED'
  ))
);

-- Optimised indexes for audit queries
CREATE INDEX idx_al_org_time       ON audit_logs (organization_id, recorded_at DESC);
CREATE INDEX idx_al_proj_time      ON audit_logs (project_id, recorded_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX idx_al_actor          ON audit_logs (actor_id, recorded_at DESC);
CREATE INDEX idx_al_event          ON audit_logs (event_type, recorded_at DESC);
CREATE INDEX idx_al_resource       ON audit_logs (resource_type, resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX idx_al_trace          ON audit_logs (trace_id);

-- Append-only enforcement: no UPDATE or DELETE via any user
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- RLS: owner sees all org logs; admin sees own project logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY al_select_owner ON audit_logs FOR SELECT
  USING (
    organization_id = buildos_current_org_id()
    AND (
      buildos_current_user_role() = 'owner'
      OR (buildos_current_user_role() = 'admin' AND (project_id IS NULL OR project_id IN (SELECT buildos_current_project_ids())))
    )
  );
CREATE POLICY al_insert_never ON audit_logs FOR INSERT WITH CHECK (false); -- service_role only
CREATE POLICY al_update_never ON audit_logs FOR UPDATE USING (false);
CREATE POLICY al_delete_never ON audit_logs FOR DELETE USING (false);

-- ─── Audit Writer Function ────────────────────────────────────────────────────
-- Called by service_role (bypasses RLS). Never call directly from user context.
CREATE OR REPLACE FUNCTION buildos_write_audit_log(
  p_organization_id uuid,
  p_workspace_id    uuid,
  p_project_id      uuid,
  p_actor_id        text,
  p_actor_type      text,
  p_event_type      text,
  p_resource_type   text,
  p_resource_id     uuid,
  p_action          text,
  p_before_state    jsonb DEFAULT NULL,
  p_after_state     jsonb DEFAULT NULL,
  p_ip_address      inet  DEFAULT NULL,
  p_user_agent      text  DEFAULT NULL,
  p_trace_id        uuid  DEFAULT gen_random_uuid(),
  p_metadata        jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
  -- Sensitive field names to redact from state snapshots
  v_sensitive_keys text[] := ARRAY['encrypted_values','api_key','secret','token','password','key','private_key'];
  v_safe_before jsonb;
  v_safe_after  jsonb;
BEGIN
  -- Redact sensitive fields from state snapshots
  v_safe_before := p_before_state;
  v_safe_after  := p_after_state;

  IF v_safe_before IS NOT NULL THEN
    DECLARE k text;
    BEGIN
      FOREACH k IN ARRAY v_sensitive_keys LOOP
        IF v_safe_before ? k THEN
          v_safe_before := jsonb_set(v_safe_before, ARRAY[k], '"[REDACTED]"');
        END IF;
      END LOOP;
    END;
  END IF;

  IF v_safe_after IS NOT NULL THEN
    DECLARE k text;
    BEGIN
      FOREACH k IN ARRAY v_sensitive_keys LOOP
        IF v_safe_after ? k THEN
          v_safe_after := jsonb_set(v_safe_after, ARRAY[k], '"[REDACTED]"');
        END IF;
      END LOOP;
    END;
  END IF;

  INSERT INTO audit_logs (
    organization_id, workspace_id, project_id,
    actor_id, actor_type, event_type, resource_type, resource_id, action,
    before_state, after_state, ip_address, user_agent, trace_id, metadata
  ) VALUES (
    p_organization_id, p_workspace_id, p_project_id,
    p_actor_id, p_actor_type, p_event_type, p_resource_type, p_resource_id, p_action,
    v_safe_before, v_safe_after, p_ip_address, p_user_agent, p_trace_id, p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ─── Automatic Audit Trigger for Task State Changes ───────────────────────────
CREATE OR REPLACE FUNCTION buildos_audit_task_state_change()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
  v_ws_id  uuid;
BEGIN
  -- Get org and workspace for the project
  SELECT w.organization_id, p.workspace_id
  INTO v_org_id, v_ws_id
  FROM projects p
  JOIN workspaces w ON w.id = p.workspace_id
  WHERE p.id = NEW.project_id;

  -- Only log meaningful status transitions
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM buildos_write_audit_log(
      p_organization_id => v_org_id,
      p_workspace_id    => v_ws_id,
      p_project_id      => NEW.project_id,
      p_actor_id        => COALESCE(auth.uid()::text, 'system'),
      p_actor_type      => CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      p_event_type      => CASE
        WHEN NEW.status = 'dispatched' THEN 'TASK_DISPATCHED'
        WHEN NEW.status = 'completed'  THEN 'TASK_COMPLETED'
        WHEN NEW.status = 'failed'     THEN 'TASK_FAILED'
        WHEN NEW.status = 'blocked'    THEN 'TASK_BLOCKED'
        ELSE NULL
      END,
      p_resource_type   => 'tasks',
      p_resource_id     => NEW.id,
      p_action          => 'update',
      p_before_state    => jsonb_build_object('status', OLD.status),
      p_after_state     => jsonb_build_object('status', NEW.status, 'agent_role', NEW.agent_role)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only fire trigger on status-relevant transitions to avoid noise
CREATE TRIGGER tasks_audit_status_change
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  WHEN (NEW.status IN ('dispatched','completed','failed','blocked') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION buildos_audit_task_state_change();

-- ─── Automatic Audit Trigger for Release State Changes ───────────────────────
CREATE OR REPLACE FUNCTION buildos_audit_release_state_change()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
  v_ws_id  uuid;
  v_event  text;
BEGIN
  SELECT w.organization_id, p.workspace_id
  INTO v_org_id, v_ws_id
  FROM projects p
  JOIN workspaces w ON w.id = p.workspace_id
  WHERE p.id = NEW.project_id;

  v_event := CASE NEW.status
    WHEN 'awaiting_approval' THEN 'RELEASE_GATE_PASSED'
    WHEN 'deploying'         THEN 'RELEASE_APPROVED'
    WHEN 'deployed'          THEN 'RELEASE_DEPLOYED'
    WHEN 'rolled_back'       THEN 'RELEASE_ROLLED_BACK'
    WHEN 'blocked'           THEN 'RELEASE_GATE_FAILED'
    ELSE NULL
  END;

  IF v_event IS NOT NULL AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM buildos_write_audit_log(
      p_organization_id => v_org_id,
      p_workspace_id    => v_ws_id,
      p_project_id      => NEW.project_id,
      p_actor_id        => COALESCE(auth.uid()::text, 'system'),
      p_actor_type      => CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      p_event_type      => v_event,
      p_resource_type   => 'release_readiness',
      p_resource_id     => NEW.id,
      p_action          => 'update',
      p_before_state    => jsonb_build_object('status', OLD.status),
      p_after_state     => jsonb_build_object(
        'status', NEW.status,
        'release_version', NEW.release_version,
        'qa_pass_rate', NEW.qa_pass_rate
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER release_audit_status_change
  AFTER UPDATE OF status ON release_readiness
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION buildos_audit_release_state_change();

-- ─── Retention: pg_cron archive job (enable after pg_cron is configured) ─────
-- Archive entries older than 90 days to Supabase Storage, then delete from hot table
-- SELECT cron.schedule('buildos-audit-archive', '0 2 * * *',
--   $$DELETE FROM audit_logs WHERE recorded_at < now() - interval '90 days'$$);
COMMENT ON TABLE audit_logs IS
  'Append-only audit ledger. Hot retention: 90 days. Archive: Supabase Storage. '
  'Register pg_cron archive job for records older than 90 days.';
