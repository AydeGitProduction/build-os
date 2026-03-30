/**
 * POST /api/admin/migrate-p9b
 *
 * ONE-TIME P9B migration: creates wizard_conversations, wizard_assumptions, wizard_state tables.
 * Idempotent (IF NOT EXISTS / CREATE OR REPLACE throughout).
 *
 * Auth: X-Buildos-Secret header
 * REMOVE AFTER CONFIRMED APPLIED.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { Client } from 'pg'

const DDL_STATEMENTS = [
  // ── set_updated_at trigger function (shared) ───────────────────────────────
  `CREATE OR REPLACE FUNCTION public.set_updated_at()
   RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   BEGIN NEW.updated_at = now(); RETURN NEW; END; $$`,

  // ── wizard_conversations ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS wizard_conversations (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    messages         jsonb       NOT NULL DEFAULT '[]'::jsonb,
    collected_fields jsonb       NOT NULL DEFAULT '{}'::jsonb,
    turn_index       integer     NOT NULL DEFAULT 0,
    readiness        integer     NOT NULL DEFAULT 0,
    trigger_fired    boolean     NOT NULL DEFAULT false,
    trigger_reason   text,
    triggered_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wizard_conversations_project_id_key UNIQUE (project_id),
    CONSTRAINT wizard_conversations_readiness_range CHECK (readiness BETWEEN 0 AND 100),
    CONSTRAINT wizard_conversations_turn_index_non_negative CHECK (turn_index >= 0),
    CONSTRAINT wizard_conversations_messages_is_array CHECK (jsonb_typeof(messages) = 'array'),
    CONSTRAINT wizard_conversations_collected_fields_is_object CHECK (jsonb_typeof(collected_fields) = 'object')
  )`,
  `CREATE INDEX IF NOT EXISTS wizard_conversations_project_idx ON wizard_conversations (project_id)`,
  `CREATE INDEX IF NOT EXISTS wizard_conversations_readiness_idx ON wizard_conversations (readiness)`,
  `DROP TRIGGER IF EXISTS trg_wizard_conversations_updated_at ON wizard_conversations`,
  `CREATE TRIGGER trg_wizard_conversations_updated_at
   BEFORE UPDATE ON wizard_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()`,
  `ALTER TABLE wizard_conversations ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wizard_conversations' AND policyname='wc_service_role') THEN
       CREATE POLICY wc_service_role ON wizard_conversations AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
     END IF;
   END $$`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON wizard_conversations TO authenticated`,
  `GRANT ALL ON wizard_conversations TO service_role`,
  `REVOKE ALL ON wizard_conversations FROM anon`,

  // ── wizard_assumptions ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS wizard_assumptions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assumption_key  text        NOT NULL CONSTRAINT wizard_assumptions_key_nonempty CHECK (char_length(assumption_key) > 0),
    label           text        NOT NULL CONSTRAINT wizard_assumptions_label_nonempty CHECK (char_length(label) > 0),
    value           text        NOT NULL,
    status          text        NOT NULL DEFAULT 'pending'
                    CONSTRAINT wizard_assumptions_status_check CHECK (status IN ('pending', 'accepted', 'rejected', 'modified')),
    modified_value  text        NULL,
    acted_by        uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    acted_at        timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wizard_assumptions_project_assumption_key UNIQUE (project_id, assumption_key)
  )`,
  `CREATE INDEX IF NOT EXISTS wizard_assumptions_project_idx ON wizard_assumptions (project_id)`,
  `CREATE INDEX IF NOT EXISTS wizard_assumptions_project_key_idx ON wizard_assumptions (project_id, assumption_key)`,
  `CREATE INDEX IF NOT EXISTS wizard_assumptions_status_idx ON wizard_assumptions (project_id, status)`,
  `DROP TRIGGER IF EXISTS trg_wizard_assumptions_updated_at ON wizard_assumptions`,
  `CREATE TRIGGER trg_wizard_assumptions_updated_at
   BEFORE UPDATE ON wizard_assumptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()`,
  `ALTER TABLE wizard_assumptions ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wizard_assumptions' AND policyname='wa_service_role') THEN
       CREATE POLICY wa_service_role ON wizard_assumptions AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
     END IF;
   END $$`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON wizard_assumptions TO authenticated`,
  `GRANT ALL ON wizard_assumptions TO service_role`,
  `REVOKE ALL ON wizard_assumptions FROM anon`,

  // ── wizard_state (migration 055) ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS public.wizard_state (
    id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
    project_id           UUID        NOT NULL,
    conversation_history JSONB       NOT NULL DEFAULT '[]'::jsonb,
    iris_complete        BOOLEAN     NOT NULL DEFAULT FALSE,
    first_user_msg       TEXT,
    readiness_score      INTEGER     NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT wizard_state_pkey          PRIMARY KEY (id),
    CONSTRAINT wizard_state_project_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT wizard_state_project_id_uq UNIQUE (project_id),
    CONSTRAINT wizard_state_readiness_score_range CHECK (readiness_score BETWEEN 0 AND 100)
  )`,
  `CREATE INDEX IF NOT EXISTS wizard_state_project_id_idx ON public.wizard_state (project_id)`,
  `DROP TRIGGER IF EXISTS trg_wizard_state_updated_at ON public.wizard_state`,
  `CREATE TRIGGER trg_wizard_state_updated_at
   BEFORE UPDATE ON public.wizard_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()`,
  `ALTER TABLE public.wizard_state ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wizard_state' AND policyname='ws_service_role') THEN
       CREATE POLICY ws_service_role ON public.wizard_state AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
     END IF;
   END $$`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON public.wizard_state TO authenticated`,
  `GRANT ALL ON public.wizard_state TO service_role`,
  `REVOKE ALL ON public.wizard_state FROM anon`,
]

export async function POST(req: NextRequest) {
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const internalSecret = req.headers.get('X-Buildos-Secret')

  if (!internalSecret || internalSecret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseRef = 'zyvpoyxdxedcugtdrluc'
  const steps: Array<{ step: string; status: string; detail?: string }> = []

  // ── Connect to Supabase via Supavisor pooler (JWT auth) ────────────────────
  const pgClient = new Client({
    host: 'aws-0-us-east-1.pooler.supabase.com',
    port: 6543,
    user: `postgres.${supabaseRef}`,
    password: serviceKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })

  let pgConnected = false
  try {
    await pgClient.connect()
    pgConnected = true
    steps.push({ step: 'pg_connect', status: 'ok' })
  } catch (e) {
    steps.push({ step: 'pg_connect', status: 'error', detail: String(e) })
    // Try eu-central-1 as fallback
    const pgClient2 = new Client({
      host: 'aws-0-eu-central-1.pooler.supabase.com',
      port: 6543,
      user: `postgres.${supabaseRef}`,
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    })
    try {
      await pgClient2.connect()
      pgConnected = true
      steps.push({ step: 'pg_connect_eu', status: 'ok' })
      // reassign
      Object.assign(pgClient, pgClient2)
    } catch (e2) {
      steps.push({ step: 'pg_connect_eu', status: 'error', detail: String(e2) })
    }
  }

  if (pgConnected) {
    for (const sql of DDL_STATEMENTS) {
      const label = sql.trim().replace(/\s+/g, ' ').substring(0, 80)
      try {
        await pgClient.query(sql)
        steps.push({ step: label, status: 'ok' })
      } catch (e) {
        const msg = String(e)
        if (msg.includes('already exists')) {
          steps.push({ step: label, status: 'already_exists' })
        } else {
          steps.push({ step: label, status: 'error', detail: msg.substring(0, 300) })
        }
      }
    }
    await pgClient.end().catch(() => {})
  }

  // ── Verify tables exist via REST ───────────────────────────────────────────
  const admin = createAdminSupabaseClient()
  const checks: Record<string, boolean> = {}

  for (const table of ['wizard_conversations', 'wizard_assumptions', 'wizard_state']) {
    const { error } = await admin.from(table).select('id').limit(1)
    checks[table] = !error
  }

  const allTablesExist = Object.values(checks).every(Boolean)

  return NextResponse.json({
    success: allTablesExist,
    tables: checks,
    steps,
    ddl_count: DDL_STATEMENTS.length,
  })
}
