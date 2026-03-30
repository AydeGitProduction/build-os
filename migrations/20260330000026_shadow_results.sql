-- ERT-P6B Hotfix: Shadow Result Isolation
-- Migration 026: shadow_results table
--
-- PROBLEM: Shadow mode (Railway) sends callbacks to /api/agent/output just like
-- the primary (n8n). When Railway fails before n8n succeeds, the task lands in
-- "blocked" — then n8n's success callback is silently ignored by the state machine
-- because blocked→awaiting_review is not a valid transition.
--
-- FIX: Shadow callbacks must NEVER reach the task state machine.
-- All Railway execution results are stored here only — non-authoritative log.
-- Primary (n8n) results remain the sole source of truth for task state.

CREATE TABLE IF NOT EXISTS shadow_results (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_run_id      UUID        NOT NULL,
  source           TEXT        NOT NULL DEFAULT 'railway'
                                 CHECK (source IN ('railway', 'shadow_worker', 'unknown')),
  idempotency_key  TEXT,
  success          BOOLEAN     NOT NULL,
  error_message    TEXT,
  output_type      TEXT,
  output_summary   TEXT,
  raw_payload      JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shadow_results_task_id
  ON shadow_results(task_id);

CREATE INDEX IF NOT EXISTS idx_shadow_results_task_run_id
  ON shadow_results(task_run_id);

CREATE INDEX IF NOT EXISTS idx_shadow_results_source
  ON shadow_results(source);

CREATE INDEX IF NOT EXISTS idx_shadow_results_success
  ON shadow_results(success);

-- Useful for reconciliation: find all tasks where shadow failed but primary succeeded
CREATE INDEX IF NOT EXISTS idx_shadow_results_task_success
  ON shadow_results(task_id, success);

COMMENT ON TABLE shadow_results IS
  'Non-authoritative log of shadow (Railway) execution results. '
  'Values here never affect task.status — primary (n8n) is always authoritative.';

COMMENT ON COLUMN shadow_results.source IS
  'railway = Railway worker shadow; shadow_worker = future shadow sources';

COMMENT ON COLUMN shadow_results.success IS
  'Whether the shadow execution reported success. Informational only.';
