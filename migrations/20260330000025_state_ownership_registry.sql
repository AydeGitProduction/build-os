-- ERT-P6B: State Architecture Separation
-- Migration 025: State Ownership Registry, Reconciliation Events, Migration Ledger, Cutover Flags

-- ============================================================
-- TABLE: state_ownership_registry
-- Single authoritative record per state domain defining:
-- who owns it, how to read/write/fallback, migration status
-- ============================================================
CREATE TABLE IF NOT EXISTS state_ownership_registry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            TEXT NOT NULL UNIQUE,           -- e.g. 'task_truth', 'locks', 'heartbeats'
  owner_layer       TEXT NOT NULL CHECK (owner_layer IN ('supabase', 'redis', 'temporal')),
  read_path         TEXT NOT NULL,                  -- description of read strategy
  write_path        TEXT NOT NULL,                  -- description of write strategy
  fallback_path     TEXT,                           -- fallback if primary unavailable
  migration_status  TEXT NOT NULL DEFAULT 'stable' CHECK (migration_status IN (
    'stable',           -- no migration in progress, owner is authoritative
    'shadow_active',    -- shadow reads comparing old vs new path
    'migrating',        -- active migration to new owner
    'cutover_pending',  -- cutover criteria met, awaiting explicit cutover
    'cutover_complete'  -- cutover done, old path decommissioned
  )),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sor_owner_layer ON state_ownership_registry(owner_layer);
CREATE INDEX IF NOT EXISTS idx_sor_migration_status ON state_ownership_registry(migration_status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_sor_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sor_updated_at ON state_ownership_registry;
CREATE TRIGGER trg_sor_updated_at
  BEFORE UPDATE ON state_ownership_registry
  FOR EACH ROW EXECUTE FUNCTION update_sor_updated_at();

-- ============================================================
-- TABLE: reconciliation_events
-- Append-only log of every drift detection check result
-- ============================================================
CREATE TABLE IF NOT EXISTS reconciliation_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            TEXT NOT NULL,
  check_type        TEXT NOT NULL CHECK (check_type IN (
    'supabase_vs_redis',
    'supabase_vs_temporal',
    'redis_vs_temporal',
    'full_sweep'
  )),
  status            TEXT NOT NULL CHECK (status IN ('ok', 'mismatch', 'error', 'skipped')),
  supabase_value    JSONB,
  redis_value       JSONB,
  temporal_value    JSONB,
  mismatch_detail   JSONB,                          -- structured diff if status=mismatch
  repair_action     TEXT,                           -- what was done to repair, if anything
  repair_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rce_domain ON reconciliation_events(domain);
CREATE INDEX IF NOT EXISTS idx_rce_status ON reconciliation_events(status);
CREATE INDEX IF NOT EXISTS idx_rce_checked_at ON reconciliation_events(checked_at DESC);

-- ============================================================
-- TABLE: migration_ledger
-- Append-only log of every migration step — mandatory per ERT-P6B rules
-- ============================================================
CREATE TABLE IF NOT EXISTS migration_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            TEXT NOT NULL,
  step_name         TEXT NOT NULL,                  -- e.g. 'redis_lock_service_enabled'
  step_type         TEXT NOT NULL CHECK (step_type IN (
    'schema_change',
    'service_enable',
    'shadow_enable',
    'cutover',
    'rollback',
    'policy_change',
    'verification'
  )),
  from_state        TEXT,                           -- state before this step
  to_state          TEXT,                           -- state after this step
  performed_by      TEXT NOT NULL DEFAULT 'system', -- 'cowork', 'developer', 'system', 'operator'
  reversible        BOOLEAN NOT NULL DEFAULT TRUE,
  rollback_steps    TEXT,                           -- how to undo this step
  evidence          JSONB,                          -- proof: test results, query outputs, etc.
  policy_violations TEXT[],                         -- any ERT-P6B rule violations detected
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_domain ON migration_ledger(domain);
CREATE INDEX IF NOT EXISTS idx_ml_step_type ON migration_ledger(step_type);
CREATE INDEX IF NOT EXISTS idx_ml_recorded_at ON migration_ledger(recorded_at DESC);

-- ============================================================
-- TABLE: cutover_flags
-- Explicit, manual-only cutover gates per domain
-- A domain may not cut over unless all criteria are met AND
-- an explicit flag row is inserted here.
-- ============================================================
CREATE TABLE IF NOT EXISTS cutover_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain                TEXT NOT NULL UNIQUE,
  cutover_authorized    BOOLEAN NOT NULL DEFAULT FALSE,
  authorized_by         TEXT,                       -- who explicitly authorized
  authorized_at         TIMESTAMPTZ,
  promotion_criteria    JSONB,                      -- copy of criteria snapshot at auth time
  shadow_match_rate     NUMERIC(5,2),               -- % of shadow reads that matched
  reconciliation_clean  BOOLEAN,                    -- was recon mismatch count == 0?
  qa_tests_passed       BOOLEAN,
  ledger_complete       BOOLEAN,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_cf_updated_at ON cutover_flags;
CREATE TRIGGER trg_cf_updated_at
  BEFORE UPDATE ON cutover_flags
  FOR EACH ROW EXECUTE FUNCTION update_sor_updated_at();

-- ============================================================
-- SEED: 10 baseline domain rows into state_ownership_registry
-- These establish ERT-P6B starting truth before any migration
-- ============================================================
INSERT INTO state_ownership_registry
  (domain, owner_layer, read_path, write_path, fallback_path, migration_status, notes)
VALUES
  (
    'task_truth',
    'supabase',
    'SELECT * FROM tasks WHERE id = $1',
    'UPDATE tasks SET ... WHERE id = $1',
    NULL,
    'stable',
    'Core task state: status, agent_role, output. Supabase is permanent source of truth.'
  ),
  (
    'delivery_gate_state',
    'supabase',
    'SELECT * FROM delivery_gate_states WHERE task_id = $1',
    'INSERT/UPDATE delivery_gate_states',
    NULL,
    'stable',
    'Gate verdicts and evidence. Must remain in Supabase for audit trail.'
  ),
  (
    'locks',
    'supabase',
    'SELECT * FROM task_locks WHERE task_id = $1',
    'INSERT INTO task_locks ... ON CONFLICT DO UPDATE',
    'supabase (current owner until Redis migration complete)',
    'shadow_active',
    'Distributed locks. Target: Redis SET NX EX. Shadow reads comparing Supabase vs Redis.'
  ),
  (
    'heartbeats',
    'supabase',
    'SELECT * FROM worker_heartbeats WHERE worker_id = $1',
    'INSERT INTO worker_heartbeats ... ON CONFLICT DO UPDATE',
    'supabase (current owner until Redis migration complete)',
    'shadow_active',
    'Worker heartbeat cache. Target: Redis HSET with TTL. Shadow reads in progress.'
  ),
  (
    'retry_schedules',
    'supabase',
    'SELECT * FROM task_retry_log WHERE task_id = $1',
    'INSERT INTO task_retry_log ...',
    'supabase fallback if Temporal unavailable',
    'shadow_active',
    'Retry counters and backoff schedules. Target: Temporal RetryWorkflow. Shadow active.'
  ),
  (
    'callback_wait_state',
    'supabase',
    'SELECT * FROM job_queue WHERE status = ''waiting_callback'' AND task_id = $1',
    'UPDATE job_queue SET status = ''waiting_callback'' ...',
    'supabase fallback if Temporal unavailable',
    'shadow_active',
    'Callback wait windows. Target: Temporal CallbackWaitWorkflow with Signal. Shadow active.'
  ),
  (
    'queue_counters',
    'supabase',
    'SELECT COUNT(*) FROM job_queue WHERE status = $1',
    'Derived from job_queue inserts/updates',
    NULL,
    'stable',
    'Queue depth counters. Derived from job_queue. Supabase permanent owner.'
  ),
  (
    'active_run_pointers',
    'supabase',
    'SELECT * FROM orchestration_runs WHERE status = ''running'' ORDER BY started_at DESC LIMIT 1',
    'INSERT INTO orchestration_runs ...',
    NULL,
    'stable',
    'Pointer to current active orchestration run. Supabase permanent owner.'
  ),
  (
    'workflow_timers',
    'supabase',
    'SELECT * FROM task_retry_log WHERE retry_after > NOW()',
    'UPDATE task_retry_log SET retry_after = ...',
    'supabase fallback if Temporal unavailable',
    'shadow_active',
    'Workflow timer state. Target: Temporal TimerWorkflow. Shadow reads in progress.'
  ),
  (
    'incident_cache',
    'supabase',
    'SELECT * FROM incidents WHERE resolved_at IS NULL ORDER BY created_at DESC',
    'INSERT INTO incidents ...',
    NULL,
    'stable',
    'Active incident records. Supabase permanent owner. May add Redis cache layer later.'
  )
ON CONFLICT (domain) DO UPDATE SET
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- ============================================================
-- SEED: Initial migration ledger entry recording this migration
-- ============================================================
INSERT INTO migration_ledger
  (domain, step_name, step_type, from_state, to_state, performed_by, reversible, rollback_steps, evidence)
VALUES
  (
    'all',
    'ert_p6b_schema_bootstrap',
    'schema_change',
    'no_state_separation',
    'registry_initialized_10_domains',
    'cowork',
    TRUE,
    'DROP TABLE cutover_flags, migration_ledger, reconciliation_events, state_ownership_registry;',
    '{"migration": "20260330000025_state_ownership_registry.sql", "domains_registered": 10, "phase": "ERT-P6B"}'::jsonb
  );
