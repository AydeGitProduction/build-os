/**
 * POST /api/admin/migrate-p7-9
 *
 * Phase 7.9 — Execution Lane Split Migration
 *
 * Adds:
 *   tasks.execution_lane VARCHAR(10) DEFAULT 'fast'
 *   task_runs.executor_used VARCHAR(20)
 *   task_runs.runtime_ms INTEGER
 *
 * Classifies existing tasks:
 *   - type='test' → heavy
 *   - type='schema' + migration/rls/audit keywords → heavy
 *   - title contains heavy keywords → heavy
 *
 * Auth: X-Buildos-Secret header
 * Idempotent: IF NOT EXISTS / safe UPDATE WHERE NULL or fast
 */

import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

const DDL_STATEMENTS = [
  // ── WS1: execution_lane on tasks ─────────────────────────────────────────
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_lane VARCHAR(10) DEFAULT 'fast'`,

  // Classify all test tasks as heavy
  `UPDATE tasks SET execution_lane = 'heavy'
   WHERE task_type = 'test'
     AND (execution_lane IS NULL OR execution_lane = 'fast')`,

  // Classify schema tasks with migration/rls/audit/batch keywords as heavy
  `UPDATE tasks SET execution_lane = 'heavy'
   WHERE task_type = 'schema'
     AND (
       lower(title) LIKE '%migration%' OR lower(title) LIKE '%migrations%'
       OR lower(title) LIKE '%rls%' OR lower(title) LIKE '%policy%'
       OR lower(title) LIKE '%audit%' OR lower(title) LIKE '%seed%'
       OR lower(title) LIKE '%batch%'
     )
     AND (execution_lane IS NULL OR execution_lane = 'fast')`,

  // Classify any task with heavy keywords in title
  `UPDATE tasks SET execution_lane = 'heavy'
   WHERE (
       lower(title) LIKE '%write tests%' OR lower(title) LIKE '%write test%'
       OR lower(title) LIKE '%integration test%' OR lower(title) LIKE '%schema migration%'
       OR lower(title) LIKE '%rls polic%' OR lower(title) LIKE '%security audit%'
       OR lower(title) LIKE '%audit rls%'
   )
   AND (execution_lane IS NULL OR execution_lane = 'fast')`,

  // ── WS6: executor_used on task_runs ────────────────────────────────────────
  `ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS executor_used VARCHAR(20)`,

  // ── WS6: runtime_ms on task_runs ───────────────────────────────────────────
  `ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS runtime_ms INTEGER`,

  // Backfill executor_used for existing completed/failed runs
  `UPDATE task_runs SET executor_used = 'n8n'
   WHERE executor_used IS NULL AND status IN ('completed', 'failed')`,
]

export async function POST(request: NextRequest) {
  const BUILDOS_SECRET =
    process.env.BUILDOS_INTERNAL_SECRET ||
    process.env.BUILDOS_SECRET ||
    ''

  const incomingSecret = request.headers.get('X-Buildos-Secret') || ''
  if (BUILDOS_SECRET && incomingSecret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseRef = 'zyvpoyxdxedcugtdrluc'
  const steps: Array<{ step: string; status: string; detail?: string }> = []

  // Try transaction pooler (us-east-1, then eu-central-1)
  const poolerHosts = [
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-eu-central-1.pooler.supabase.com',
  ]

  let pgClient: Client | null = null
  for (const host of poolerHosts) {
    const client = new Client({
      host,
      port: 6543,
      user: `postgres.${supabaseRef}`,
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    })
    try {
      await client.connect()
      pgClient = client
      steps.push({ step: `pg_connect(${host})`, status: 'ok' })
      break
    } catch (e) {
      steps.push({ step: `pg_connect(${host})`, status: 'error', detail: String(e).slice(0, 200) })
    }
  }

  if (!pgClient) {
    return NextResponse.json({
      success: false,
      message: 'pg connection failed — apply MIGRATE-P7-9.sql via Supabase SQL Editor',
      steps,
    }, { status: 500 })
  }

  // Run all DDL statements
  for (const sql of DDL_STATEMENTS) {
    const label = sql.trim().replace(/\s+/g, ' ').substring(0, 100)
    try {
      const result = await pgClient.query(sql)
      const detail = result.rowCount != null ? `rows_affected=${result.rowCount}` : undefined
      steps.push({ step: label, status: 'ok', detail })
    } catch (e) {
      const msg = String(e)
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        steps.push({ step: label, status: 'already_exists' })
      } else {
        steps.push({ step: label, status: 'error', detail: msg.substring(0, 300) })
      }
    }
  }

  await pgClient.end().catch(() => {})

  // Verify via REST
  const { createAdminSupabaseClient } = await import('@/lib/supabase/server')
  const admin = createAdminSupabaseClient()

  // Check columns exist by trying to select them
  const { error: laneErr } = await admin
    .from('tasks')
    .select('execution_lane')
    .limit(1)

  const { error: execErr } = await admin
    .from('task_runs')
    .select('executor_used')
    .limit(1)

  const { error: rtErr } = await admin
    .from('task_runs')
    .select('runtime_ms')
    .limit(1)

  // Count heavy tasks
  const { count: heavyCount } = await admin
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('execution_lane', 'heavy')

  const verification = {
    tasks_execution_lane: !laneErr,
    task_runs_executor_used: !execErr,
    task_runs_runtime_ms: !rtErr,
    heavy_tasks_count: heavyCount ?? 0,
  }

  const success = verification.tasks_execution_lane &&
    verification.task_runs_executor_used &&
    verification.task_runs_runtime_ms

  return NextResponse.json({
    success,
    verification,
    steps,
    message: success
      ? `Phase 7.9 migration complete. ${heavyCount ?? 0} tasks classified as heavy.`
      : 'Migration ran but verification failed — check steps for errors',
  })
}
