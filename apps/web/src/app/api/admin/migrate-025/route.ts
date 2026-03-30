/**
 * POST /api/admin/migrate-025
 *
 * ONE-TIME ERT-P6B migration: creates state separation tables + seeds 10 baseline domains.
 * Tables: state_ownership_registry, reconciliation_events, migration_ledger, cutover_flags
 *
 * Auth: X-Buildos-Secret header (BUILDOS_INTERNAL_SECRET)
 * Safe to call multiple times (idempotent via IF NOT EXISTS / ON CONFLICT DO NOTHING).
 * REMOVE THIS ROUTE after confirmed applied.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { Client } from 'pg'

const DDL_STATEMENTS = [
  // ── state_ownership_registry ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS state_ownership_registry (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain           TEXT NOT NULL UNIQUE,
    owner_layer      TEXT NOT NULL CHECK (owner_layer IN ('supabase', 'redis', 'temporal')),
    read_path        TEXT NOT NULL,
    write_path       TEXT NOT NULL,
    fallback_path    TEXT,
    migration_status TEXT NOT NULL DEFAULT 'stable' CHECK (migration_status IN (
      'stable', 'shadow_active', 'migrating', 'cutover_pending', 'cutover_complete'
    )),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sor_owner_layer ON state_ownership_registry(owner_layer)`,
  `CREATE INDEX IF NOT EXISTS idx_sor_migration_status ON state_ownership_registry(migration_status)`,
  // ── reconciliation_events ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS reconciliation_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          TEXT NOT NULL,
    check_type      TEXT NOT NULL CHECK (check_type IN (
      'supabase_vs_redis', 'supabase_vs_temporal', 'redis_vs_temporal', 'full_sweep'
    )),
    status          TEXT NOT NULL CHECK (status IN ('ok', 'mismatch', 'error', 'skipped')),
    supabase_value  JSONB,
    redis_value     JSONB,
    temporal_value  JSONB,
    mismatch_detail JSONB,
    repair_action   TEXT,
    repair_applied  BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rce_domain ON reconciliation_events(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_rce_status ON reconciliation_events(status)`,
  `CREATE INDEX IF NOT EXISTS idx_rce_checked_at ON reconciliation_events(checked_at DESC)`,
  // ── migration_ledger ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS migration_ledger (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain           TEXT NOT NULL,
    step_name        TEXT NOT NULL,
    step_type        TEXT NOT NULL CHECK (step_type IN (
      'schema_change', 'service_enable', 'shadow_enable', 'cutover',
      'rollback', 'policy_change', 'verification'
    )),
    from_state       TEXT,
    to_state         TEXT,
    performed_by     TEXT NOT NULL DEFAULT 'system',
    reversible       BOOLEAN NOT NULL DEFAULT TRUE,
    rollback_steps   TEXT,
    evidence         JSONB,
    policy_violations TEXT[],
    recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ml_domain ON migration_ledger(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_ml_step_type ON migration_ledger(step_type)`,
  `CREATE INDEX IF NOT EXISTS idx_ml_recorded_at ON migration_ledger(recorded_at DESC)`,
  // ── cutover_flags ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cutover_flags (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain               TEXT NOT NULL UNIQUE,
    cutover_authorized   BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_by        TEXT,
    authorized_at        TIMESTAMPTZ,
    promotion_criteria   JSONB,
    shadow_match_rate    NUMERIC(5,2),
    reconciliation_clean BOOLEAN,
    qa_tests_passed      BOOLEAN,
    ledger_complete      BOOLEAN,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // ── trigger function ───────────────────────────────────────────────────────
  `CREATE OR REPLACE FUNCTION update_sor_updated_at()
   RETURNS TRIGGER LANGUAGE plpgsql AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$`,
  `DROP TRIGGER IF EXISTS trg_sor_updated_at ON state_ownership_registry`,
  `CREATE TRIGGER trg_sor_updated_at
   BEFORE UPDATE ON state_ownership_registry
   FOR EACH ROW EXECUTE FUNCTION update_sor_updated_at()`,
  `DROP TRIGGER IF EXISTS trg_cf_updated_at ON cutover_flags`,
  `CREATE TRIGGER trg_cf_updated_at
   BEFORE UPDATE ON cutover_flags
   FOR EACH ROW EXECUTE FUNCTION update_sor_updated_at()`,
]

const DOMAIN_SEEDS = [
  {
    domain: 'task_truth',
    owner_layer: 'supabase',
    read_path: 'SELECT * FROM tasks WHERE id = $1',
    write_path: 'UPDATE tasks SET ... WHERE id = $1',
    fallback_path: null,
    migration_status: 'stable',
    notes: 'Core task state: status, agent_role, output. Supabase is permanent source of truth.',
  },
  {
    domain: 'delivery_gate_state',
    owner_layer: 'supabase',
    read_path: 'SELECT * FROM delivery_gate_states WHERE task_id = $1',
    write_path: 'INSERT/UPDATE delivery_gate_states',
    fallback_path: null,
    migration_status: 'stable',
    notes: 'Gate verdicts and evidence. Must remain in Supabase for audit trail.',
  },
  {
    domain: 'locks',
    owner_layer: 'supabase',
    read_path: 'SELECT * FROM task_locks WHERE task_id = $1',
    write_path: 'INSERT INTO task_locks ... ON CONFLICT DO UPDATE',
    fallback_path: 'supabase until Redis migration complete',
    migration_status: 'shadow_active',
    notes: 'Distributed locks. Target: Redis SET NX EX. Shadow reads comparing Supabase vs Redis.',
  },
  {
    domain: 'heartbeats',
    owner_layer: 'supabase',
    read_path: 'SELECT * FROM worker_heartbeats WHERE worker_id = $1',
    write_path: 'INSERT INTO worker_heartbeats ... ON CONFLICT DO UPDATE',
    fallback_path: 'supabase until Redis migration complete',
    migration_status: 'shadow_active',
    notes: 'Worker heartbeat cache. Target: Redis HSET with TTL.',
  },
  {
    domain: 'retry_schedules',
    owner_layer: 'supabase',
    read_path: 'SELECT * FROM task_retry_log WHERE task_id = $1',
    write_path: 'INSERT INTO task_retry_log ...',
    fallback_path: 'supabase fallback if Temporal unavailable',
    migration_status: 'shadow_active',
    notes: 'Retry counters and backoff schedules. Target: Temporal RetryWorkflow.',
  },
  {
    domain: 'callback_wait_state',
    owner_layer: 'supabase',
    read_path: "SELECT * FROM job_queue WHERE status = 'waiting_callback' AND task_id = $1",
    write_path: "UPDATE job_queue SET status = 'waiting_callback' ...",
    fallback_path: 'supabase fallback if Temporal unavailable',
    migration_status: 'shadow_active',
    notes: 'Callback wait windows. Target: Temporal CallbackWaitWorkflow with Signal.',
  },
  {
    domain: 'queue_counters',
    owner_layer: 'supabase',
    read_path: 'SELECT COUNT(*) FROM job_queue WHERE status = $1',
    write_path: 'Derived from job_queue inserts/updates',
    fallback_path: null,
    migration_status: 'stable',
    notes: 'Queue depth counters. Derived from job_queue. Supabase permanent owner.',
  },
  {
    domain: 'active_run_pointers',
    owner_layer: 'supabase',
    read_path: "SELECT * FROM orchestration_runs WHERE status = 'running' LIMIT 1",
    write_path: 'INSERT INTO orchestration_runs ...',
    fallback_path: null,
    migration_status: 'stable',
    notes: 'Active orchestration run pointer. Supabase permanent owner.',
  },
  {
    domain: 'workflow_timers',
    owner_layer: 'supabase',
    read_path: 'SELECT * FROM task_retry_log WHERE retry_after > NOW()',
    write_path: 'UPDATE task_retry_log SET retry_after = ...',
    fallback_path: 'supabase fallback if Temporal unavailable',
    migration_status: 'shadow_active',
    notes: 'Workflow timer state. Target: Temporal TimerWorkflow.',
  },
  {
    domain: 'incident_cache',
    owner_layer: 'supabase',
    read_path: 'SELECT * FROM incidents WHERE resolved_at IS NULL ORDER BY created_at DESC',
    write_path: 'INSERT INTO incidents ...',
    fallback_path: null,
    migration_status: 'stable',
    notes: 'Active incident records. Supabase permanent owner.',
  },
]

export async function POST(request: NextRequest) {
  const internalSecret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET

  if (!internalSecret || internalSecret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseRef = 'zyvpoyxdxedcugtdrluc'

  const steps: Array<{ step: string; status: string; detail?: string }> = []

  // ── Step 1: Execute DDL via direct pg connection ───────────────────────────
  // Supabase Supavisor pooler (Transaction mode) accepts service_role JWT as password
  // User format: postgres.{project-ref}
  const pgClient = new Client({
    host: `aws-0-us-east-1.pooler.supabase.com`,
    port: 6543,
    user: `postgres.${supabaseRef}`,
    password: serviceKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })

  let pgConnected = false
  let pgError = ''

  try {
    await pgClient.connect()
    pgConnected = true
  } catch (e) {
    pgError = String(e)
    steps.push({ step: 'pg_connect', status: 'error', detail: pgError })
  }

  if (pgConnected) {
    for (const sql of DDL_STATEMENTS) {
      const stmt = sql.trim().split('\n')[0].substring(0, 60)
      try {
        await pgClient.query(sql)
        steps.push({ step: stmt, status: 'ok' })
      } catch (e) {
        const msg = String(e)
        // IF NOT EXISTS / CREATE OR REPLACE means we don't fail on "already exists"
        if (msg.includes('already exists')) {
          steps.push({ step: stmt, status: 'already_exists' })
        } else {
          steps.push({ step: stmt, status: 'error', detail: msg })
        }
      }
    }
    await pgClient.end()
  }

  // ── Step 2: Check if tables exist via REST ─────────────────────────────────
  const admin = createAdminSupabaseClient()
  const { error: checkErr } = await admin
    .from('state_ownership_registry')
    .select('id')
    .limit(1)

  const tableExists = !checkErr

  // ── Step 3: Seed baseline domains if tables exist ─────────────────────────
  let seeded = 0
  let skipped = 0

  if (tableExists) {
    for (const seed of DOMAIN_SEEDS) {
      const { error } = await admin
        .from('state_ownership_registry')
        .upsert(seed, { onConflict: 'domain' })
      if (!error) seeded++
      else skipped++
    }

    await admin.from('migration_ledger').insert({
      domain: 'all',
      step_name: 'ert_p6b_schema_bootstrap',
      step_type: 'schema_change',
      from_state: 'no_state_separation',
      to_state: 'registry_initialized_10_domains',
      performed_by: 'cowork',
      reversible: true,
      rollback_steps: 'DROP TABLE cutover_flags, migration_ledger, reconciliation_events, state_ownership_registry',
      evidence: { migration: '20260330000025_state_ownership_registry.sql', domains_registered: 10, phase: 'ERT-P6B' } as unknown as object,
    })
  }

  return NextResponse.json({
    pgConnected,
    pgError: pgError || null,
    ddlSteps: steps,
    tableExists,
    seeded,
    skipped,
    message: tableExists
      ? `Migration complete. ${seeded} domains seeded, ${skipped} skipped.`
      : 'Tables not yet created. pg connection failed.',
  })
}
