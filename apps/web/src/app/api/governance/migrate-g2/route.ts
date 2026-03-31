/**
 * POST /api/governance/migrate-g2
 *
 * ONE-TIME migration endpoint for Block G2.
 * Creates: incidents, incident_root_causes, incident_fixes tables + sequence.
 * Safe to call multiple times (CREATE ... IF NOT EXISTS).
 *
 * Auth: X-Buildos-Secret required (internal only).
 *
 * DELETE THIS FILE after G2 tables are confirmed in production.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  // Internal auth only
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

  // ── Step 1: Create sequence ───────────────────────────────────────────────
  try {
    await admin.rpc('exec_ddl' as never, {
      sql: `CREATE SEQUENCE IF NOT EXISTS incident_code_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1`
    } as never)
    results.push({ step: 'sequence', status: 'ok' })
  } catch (e: unknown) {
    results.push({ step: 'sequence', status: 'error', detail: String(e) })
  }

  // ── Step 2: Create incidents table ───────────────────────────────────────
  const incidentsDDL = `
    CREATE TABLE IF NOT EXISTS incidents (
      id                uuid          NOT NULL DEFAULT gen_random_uuid(),
      incident_code     text          NOT NULL DEFAULT ('INC-' || LPAD(nextval('incident_code_seq')::text, 4, '0')),
      title             text          NOT NULL,
      description       text,
      severity          text          NOT NULL,
      incident_type     text          NOT NULL,
      status            text          NOT NULL DEFAULT 'open',
      owner_domain      text          NOT NULL,
      related_task_id   uuid,
      related_rule_id   uuid REFERENCES prevention_rules(id) ON DELETE SET NULL,
      created_at        timestamptz   NOT NULL DEFAULT now(),
      updated_at        timestamptz   NOT NULL DEFAULT now(),
      closed_at         timestamptz,
      CONSTRAINT incidents_pkey         PRIMARY KEY (id),
      CONSTRAINT incidents_code_uq      UNIQUE (incident_code),
      CONSTRAINT incidents_severity_ck  CHECK (severity IN ('P0','P1','P2','P3')),
      CONSTRAINT incidents_type_ck      CHECK (incident_type IN ('logic','state','contract','ui','infra','data','security','performance','workflow')),
      CONSTRAINT incidents_status_ck    CHECK (status IN ('open','investigating','fix_in_progress','closed')),
      CONSTRAINT incidents_owner_ck     CHECK (owner_domain IN ('backend','infra','frontend','qa','architect','security'))
    )`

  try {
    await admin.rpc('exec_ddl' as never, { sql: incidentsDDL } as never)
    results.push({ step: 'incidents_table', status: 'ok' })
  } catch (e: unknown) {
    results.push({ step: 'incidents_table', status: 'error', detail: String(e) })
  }

  // ── Step 3: Create incident_root_causes table ────────────────────────────
  const rcDDL = `
    CREATE TABLE IF NOT EXISTS incident_root_causes (
      id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
      incident_id             uuid        NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      symptom                 text        NOT NULL,
      trigger                 text        NOT NULL,
      broken_assumption       text        NOT NULL,
      missing_guardrail       text        NOT NULL,
      why_not_caught_earlier  text        NOT NULL,
      created_at              timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT incident_root_causes_pkey PRIMARY KEY (id)
    )`

  try {
    await admin.rpc('exec_ddl' as never, { sql: rcDDL } as never)
    results.push({ step: 'incident_root_causes_table', status: 'ok' })
  } catch (e: unknown) {
    results.push({ step: 'incident_root_causes_table', status: 'error', detail: String(e) })
  }

  // ── Step 4: Create incident_fixes table ──────────────────────────────────
  const fixesDDL = `
    CREATE TABLE IF NOT EXISTS incident_fixes (
      id                         uuid        NOT NULL DEFAULT gen_random_uuid(),
      incident_id                uuid        NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      fix_type                   text        NOT NULL,
      fix_description            text        NOT NULL,
      implementation_notes       text        NOT NULL,
      permanent_prevention_added boolean     NOT NULL DEFAULT false,
      created_at                 timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT incident_fixes_pkey    PRIMARY KEY (id),
      CONSTRAINT incident_fixes_type_ck CHECK (fix_type IN ('permanent','temporary','workaround','mitigation'))
    )`

  try {
    await admin.rpc('exec_ddl' as never, { sql: fixesDDL } as never)
    results.push({ step: 'incident_fixes_table', status: 'ok' })
  } catch (e: unknown) {
    results.push({ step: 'incident_fixes_table', status: 'error', detail: String(e) })
  }

  // ── Step 5: Verify tables by probing them ────────────────────────────────
  const checks: Array<{ table: string; exists: boolean }> = []
  for (const table of ['incidents', 'incident_root_causes', 'incident_fixes']) {
    const { error } = await (admin as ReturnType<typeof createAdminSupabaseClient>)
      .from(table as 'incidents')
      .select('id')
      .limit(0)
    checks.push({ table, exists: !error })
  }

  const allOk = checks.every(c => c.exists)

  return NextResponse.json({
    migration: 'G2',
    steps:     results,
    table_checks: checks,
    ready:     allOk,
    message:   allOk
      ? 'G2 tables created and verified. Safe to run test scenario.'
      : 'Some tables failed — check steps and apply MIGRATE-G2.sql in Supabase SQL Editor.',
  }, { status: allOk ? 200 : 500 })
}
