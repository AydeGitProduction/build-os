/**
 * POST /api/governance/migrate-g4
 *
 * ONE-TIME migration endpoint for Block G4.
 * Creates: commit_delivery_logs table.
 * Safe to call multiple times (CREATE ... IF NOT EXISTS).
 *
 * Auth: X-Buildos-Secret required (internal only).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [
    process.env.BUILDOS_INTERNAL_SECRET,
    process.env.BUILDOS_SECRET,
  ].filter(Boolean)

  if (!secret || !validSecrets.includes(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const results: Array<{ step: string; status: 'ok' | 'error'; detail?: string }> = []

  // ── commit_delivery_logs table ────────────────────────────────────────────
  const ddl = `
    CREATE TABLE IF NOT EXISTS commit_delivery_logs (
      id                   uuid          NOT NULL DEFAULT gen_random_uuid(),
      task_id              uuid          NOT NULL,
      project_id           uuid,
      repo_name            text          NOT NULL,
      branch_name          text          NOT NULL DEFAULT 'main',
      target_path          text          NOT NULL,
      stub_created         boolean       NOT NULL DEFAULT false,
      token_refreshed      boolean       NOT NULL DEFAULT false,
      commit_sha           text,
      commit_verified      boolean       NOT NULL DEFAULT false,
      verification_notes   text,
      escalated            boolean       NOT NULL DEFAULT false,
      incident_id          uuid,
      created_at           timestamptz   NOT NULL DEFAULT now(),
      CONSTRAINT commit_delivery_logs_pkey PRIMARY KEY (id)
    )`

  try {
    await admin.rpc('exec_ddl' as never, { sql: ddl } as never)
    results.push({ step: 'commit_delivery_logs', status: 'ok' })
  } catch (e: unknown) {
    results.push({ step: 'commit_delivery_logs', status: 'error', detail: String(e) })
  }

  // ── index: task_id for fast lookups ──────────────────────────────────────
  try {
    await admin.rpc('exec_ddl' as never, {
      sql: `CREATE INDEX IF NOT EXISTS commit_delivery_logs_task_id_idx ON commit_delivery_logs (task_id)`
    } as never)
    results.push({ step: 'task_id_index', status: 'ok' })
  } catch (e: unknown) {
    results.push({ step: 'task_id_index', status: 'error', detail: String(e) })
  }

  // ── index: commit_verified=false for failure queries ─────────────────────
  try {
    await admin.rpc('exec_ddl' as never, {
      sql: `CREATE INDEX IF NOT EXISTS commit_delivery_logs_unverified_idx ON commit_delivery_logs (task_id) WHERE commit_verified = false`
    } as never)
    results.push({ step: 'unverified_index', status: 'ok' })
  } catch (e: unknown) {
    results.push({ step: 'unverified_index', status: 'error', detail: String(e) })
  }

  const allOk = results.every(r => r.status === 'ok')
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 })
}
