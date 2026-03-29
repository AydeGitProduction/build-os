-- ============================================================
-- BUILD OS — Migration 023: ERT-P5 Failure Handling Schema
-- ============================================================
-- Phase:   ERT-P5 — Real Delivery & Failure Handling System
-- Date:    2026-03-30
-- Author:  Build OS Infra (Cowork)
-- Safe:    Idempotent — all ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS
-- ============================================================

SET client_min_messages TO WARNING;

-- ─── 1. Extend tasks.status CHECK constraint ──────────────────────────────────
-- Drop the old constraint and replace with expanded set.
-- New statuses: failed_retryable, failed_permanent, infra_failed,
--               unsupported, requires_input, escalated

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (
  status IN (
    -- existing
    'pending', 'ready', 'dispatched', 'in_progress',
    'awaiting_review', 'in_qa', 'blocked', 'failed',
    'completed', 'cancelled',
    -- ERT-P5 new
    'failed_retryable', 'failed_permanent', 'infra_failed',
    'unsupported', 'requires_input', 'escalated'
  )
);

-- ─── 2. Add failure taxonomy columns to tasks ─────────────────────────────────

-- Top-level failure category
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS failure_category text
    CHECK (failure_category IN (
      'infra', 'logic', 'quota', 'timeout', 'unsupported',
      'blocked', 'human_required', 'unknown'
    ));

-- Detailed failure information (free text, from agent output or system)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS failure_detail text;

-- Suggestion for resolution (from agent UNSUPPORTED signal or system)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS failure_suggestion text;

-- Timestamp of most recent failure transition
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- Cumulative failure count (incremented on each failure, not reset on retry)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;

-- Reason code when status = 'unsupported' (from UNSUPPORTED:<reason_code>:... signal)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS unsupported_reason text;

-- Infrastructure failure subtype (when failure_category = 'infra')
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS infra_failure_type text
    CHECK (infra_failure_type IN (
      'n8n_unreachable', 'supabase_timeout', 'webhook_timeout',
      'dispatch_error', 'callback_error', 'unknown'
    ));

-- ─── 3. retry_logs table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS retry_logs (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  task_id         uuid          NOT NULL,
  project_id      uuid          NOT NULL,
  retry_type      text          NOT NULL,
  attempt_number  integer       NOT NULL DEFAULT 1,
  delay_ms        integer       NOT NULL DEFAULT 0,
  triggered_by    text          NOT NULL DEFAULT 'orchestrator',
  triggered_at    timestamptz   NOT NULL DEFAULT now(),
  next_retry_at   timestamptz,
  result          text,
  result_detail   text,
  created_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT retry_logs_pkey          PRIMARY KEY (id),
  CONSTRAINT retry_logs_task_fk       FOREIGN KEY (task_id)    REFERENCES tasks(id)    ON DELETE CASCADE,
  CONSTRAINT retry_logs_project_fk    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT retry_logs_type_check    CHECK (retry_type IN ('infra', 'logic', 'manual', 'supervisor')),
  CONSTRAINT retry_logs_result_check  CHECK (result IS NULL OR result IN ('dispatched', 'skipped', 'gave_up', 'pending'))
);

CREATE INDEX IF NOT EXISTS idx_retry_logs_task_id    ON retry_logs (task_id);
CREATE INDEX IF NOT EXISTS idx_retry_logs_project_id ON retry_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_retry_logs_next_retry ON retry_logs (next_retry_at) WHERE result = 'pending';

ALTER TABLE retry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY retry_logs_service_all ON retry_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. system_incidents table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_incidents (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_id          uuid          NOT NULL,
  incident_type       text          NOT NULL,
  severity            text          NOT NULL DEFAULT 'medium',
  status              text          NOT NULL DEFAULT 'open',
  title               text          NOT NULL,
  description         text,
  affected_task_ids   uuid[]        NOT NULL DEFAULT '{}',
  metadata            jsonb         NOT NULL DEFAULT '{}',
  detected_at         timestamptz   NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  acknowledged_at     timestamptz,
  acknowledged_by     uuid,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT system_incidents_pkey          PRIMARY KEY (id),
  CONSTRAINT system_incidents_project_fk    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT system_incidents_type_check    CHECK (incident_type IN (
    'repeated_task_failure', 'stuck_loop', 'infra_outage',
    'quota_exhaustion', 'high_failure_rate', 'escalation_surge'
  )),
  CONSTRAINT system_incidents_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT system_incidents_status_check   CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive'))
);

CREATE INDEX IF NOT EXISTS idx_system_incidents_project_id ON system_incidents (project_id);
CREATE INDEX IF NOT EXISTS idx_system_incidents_status     ON system_incidents (status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_system_incidents_type       ON system_incidents (incident_type);

CREATE OR REPLACE TRIGGER system_incidents_updated_at
  BEFORE UPDATE ON system_incidents
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE system_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_incidents_service_all ON system_incidents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 5. Indexes for new tasks columns ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_failure_category  ON tasks (failure_category) WHERE failure_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_failed_at         ON tasks (failed_at)         WHERE failed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_failure_count     ON tasks (failure_count)     WHERE failure_count > 0;

-- ─── 6. Update auto-update trigger for system_incidents ───────────────────────
-- (buildos_set_updated_at already exists from migration 001)

-- Done.
COMMENT ON COLUMN tasks.failure_category    IS 'ERT-P5: Top-level failure classification (infra/logic/quota/etc)';
COMMENT ON COLUMN tasks.failure_detail      IS 'ERT-P5: Human-readable failure detail from agent or system';
COMMENT ON COLUMN tasks.failure_suggestion  IS 'ERT-P5: Suggested resolution, from UNSUPPORTED signal or operator';
COMMENT ON COLUMN tasks.failed_at           IS 'ERT-P5: Timestamp of most recent failure event';
COMMENT ON COLUMN tasks.failure_count       IS 'ERT-P5: Cumulative failure count across all retries';
COMMENT ON COLUMN tasks.unsupported_reason  IS 'ERT-P5: Reason code from UNSUPPORTED:<code>:... agent signal';
COMMENT ON COLUMN tasks.infra_failure_type  IS 'ERT-P5: Infrastructure failure subtype when category=infra';
COMMENT ON TABLE  retry_logs                IS 'ERT-P5: Retry attempt audit trail with backoff delay tracking';
COMMENT ON TABLE  system_incidents          IS 'ERT-P5: Detected operational incidents (outages, loops, surges)';
