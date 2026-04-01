/**
 * POST /api/governance/migrate-g5
 *
 * ONE-TIME migration for Block G5: Governance Memory Layer.
 * Creates 5 governance memory tables.
 * Safe to call multiple times (CREATE ... IF NOT EXISTS).
 *
 * Auth: X-Buildos-Secret required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [process.env.BUILDOS_INTERNAL_SECRET, process.env.BUILDOS_SECRET].filter(Boolean)
  if (!secret || !validSecrets.includes(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const results: Array<{ step: string; status: 'ok' | 'error'; detail?: string }> = []

  const tables: Array<{ step: string; sql: string }> = [
    {
      step: 'task_events',
      sql: `CREATE TABLE IF NOT EXISTS task_events (
        id          uuid        NOT NULL DEFAULT gen_random_uuid(),
        task_id     uuid        NOT NULL,
        project_id  uuid,
        event_type  text        NOT NULL,
        actor_type  text        NOT NULL DEFAULT 'system',
        actor_id    text,
        details     jsonb,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT task_events_pkey           PRIMARY KEY (id),
        CONSTRAINT task_events_event_type_ck  CHECK (event_type <> ''),
        CONSTRAINT task_events_actor_type_ck  CHECK (actor_type <> '')
      )`,
    },
    {
      step: 'task_events_task_idx',
      sql: `CREATE INDEX IF NOT EXISTS task_events_task_id_idx ON task_events (task_id)`,
    },
    {
      step: 'task_events_project_idx',
      sql: `CREATE INDEX IF NOT EXISTS task_events_project_id_idx ON task_events (project_id) WHERE project_id IS NOT NULL`,
    },
    {
      step: 'handoff_events',
      sql: `CREATE TABLE IF NOT EXISTS handoff_events (
        id            uuid        NOT NULL DEFAULT gen_random_uuid(),
        task_id       uuid        NOT NULL,
        from_role     text        NOT NULL,
        to_role       text        NOT NULL,
        handoff_type  text        NOT NULL DEFAULT 'dispatch',
        notes         text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT handoff_events_pkey          PRIMARY KEY (id),
        CONSTRAINT handoff_events_from_role_ck  CHECK (from_role <> ''),
        CONSTRAINT handoff_events_to_role_ck    CHECK (to_role <> '')
      )`,
    },
    {
      step: 'handoff_events_task_idx',
      sql: `CREATE INDEX IF NOT EXISTS handoff_events_task_id_idx ON handoff_events (task_id)`,
    },
    {
      step: 'settings_changes',
      sql: `CREATE TABLE IF NOT EXISTS settings_changes (
        id              uuid        NOT NULL DEFAULT gen_random_uuid(),
        setting_area    text        NOT NULL,
        setting_key     text        NOT NULL,
        previous_value  text,
        new_value       text,
        reason          text        NOT NULL,
        changed_by      text        NOT NULL DEFAULT 'system',
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT settings_changes_pkey       PRIMARY KEY (id),
        CONSTRAINT settings_changes_reason_ck  CHECK (reason <> ''),
        CONSTRAINT settings_changes_area_ck    CHECK (setting_area <> ''),
        CONSTRAINT settings_changes_key_ck     CHECK (setting_key <> '')
      )`,
    },
    {
      step: 'release_gate_checks',
      sql: `CREATE TABLE IF NOT EXISTS release_gate_checks (
        id               uuid        NOT NULL DEFAULT gen_random_uuid(),
        project_id       uuid,
        gate_name        text        NOT NULL,
        gate_status      text        NOT NULL,
        evidence_summary text,
        checked_by       text        NOT NULL DEFAULT 'system',
        created_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT release_gate_checks_pkey       PRIMARY KEY (id),
        CONSTRAINT release_gate_checks_name_ck    CHECK (gate_name <> ''),
        CONSTRAINT release_gate_checks_status_ck  CHECK (gate_status IN ('passed','failed','skipped','pending'))
      )`,
    },
    {
      step: 'release_gate_checks_project_idx',
      sql: `CREATE INDEX IF NOT EXISTS release_gate_checks_project_id_idx ON release_gate_checks (project_id) WHERE project_id IS NOT NULL`,
    },
    {
      step: 'manual_override_log',
      sql: `CREATE TABLE IF NOT EXISTS manual_override_log (
        id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
        override_type       text        NOT NULL,
        target_entity_type  text        NOT NULL,
        target_entity_id    text        NOT NULL,
        reason              text        NOT NULL,
        performed_by        text        NOT NULL DEFAULT 'system',
        created_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT manual_override_log_pkey       PRIMARY KEY (id),
        CONSTRAINT manual_override_log_reason_ck  CHECK (reason <> ''),
        CONSTRAINT manual_override_log_type_ck    CHECK (override_type <> '')
      )`,
    },
  ]

  for (const t of tables) {
    try {
      await admin.rpc('exec_ddl' as never, { sql: t.sql } as never)
      results.push({ step: t.step, status: 'ok' })
    } catch (e: unknown) {
      results.push({ step: t.step, status: 'error', detail: String(e) })
    }
  }

  const allOk = results.every(r => r.status === 'ok')
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 })
}
