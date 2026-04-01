-- ─── Block G5: Governance Memory Layer ───────────────────────────────────────
-- Migration: 20260401000030_g5_governance_memory
-- Purpose:   Create 5 governance memory tables for audit trail.
--            All tables are append-only (no UPDATE/DELETE).
--            Every governance-relevant action leaves a durable trace.
--
-- NEVER run via pg.Client or node-postgres (RULE-09).
-- Execute in Supabase SQL Editor directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. task_events ───────────────────────────────────────────────────────────
-- Tracks every significant state change or governance-relevant action on a task.

CREATE TABLE IF NOT EXISTS task_events (
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
);

CREATE INDEX IF NOT EXISTS task_events_task_id_idx    ON task_events (task_id);
CREATE INDEX IF NOT EXISTS task_events_project_id_idx ON task_events (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='task_events' AND policyname='task_events_service_all') THEN
    CREATE POLICY task_events_service_all ON task_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON task_events TO service_role;
GRANT SELECT ON task_events TO authenticated;
REVOKE ALL ON task_events FROM anon;

-- ─── 2. handoff_events ────────────────────────────────────────────────────────
-- Tracks role-to-role handoffs in the pipeline.

CREATE TABLE IF NOT EXISTS handoff_events (
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
);

CREATE INDEX IF NOT EXISTS handoff_events_task_id_idx ON handoff_events (task_id);

ALTER TABLE handoff_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='handoff_events' AND policyname='handoff_events_service_all') THEN
    CREATE POLICY handoff_events_service_all ON handoff_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON handoff_events TO service_role;
GRANT SELECT ON handoff_events TO authenticated;
REVOKE ALL ON handoff_events FROM anon;

-- ─── 3. settings_changes ─────────────────────────────────────────────────────
-- Immutable log of every setting that changed, with reason and actor.

CREATE TABLE IF NOT EXISTS settings_changes (
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
);

ALTER TABLE settings_changes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings_changes' AND policyname='settings_changes_service_all') THEN
    CREATE POLICY settings_changes_service_all ON settings_changes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON settings_changes TO service_role;
GRANT SELECT ON settings_changes TO authenticated;
REVOKE ALL ON settings_changes FROM anon;

-- ─── 4. release_gate_checks ──────────────────────────────────────────────────
-- Records every release readiness check, pass or fail.

CREATE TABLE IF NOT EXISTS release_gate_checks (
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
);

CREATE INDEX IF NOT EXISTS release_gate_checks_project_id_idx ON release_gate_checks (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE release_gate_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='release_gate_checks' AND policyname='release_gate_checks_service_all') THEN
    CREATE POLICY release_gate_checks_service_all ON release_gate_checks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON release_gate_checks TO service_role;
GRANT SELECT ON release_gate_checks TO authenticated;
REVOKE ALL ON release_gate_checks FROM anon;

-- ─── 5. manual_override_log ──────────────────────────────────────────────────
-- Records every manual intervention in the autonomous pipeline.

CREATE TABLE IF NOT EXISTS manual_override_log (
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
);

ALTER TABLE manual_override_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='manual_override_log' AND policyname='manual_override_log_service_all') THEN
    CREATE POLICY manual_override_log_service_all ON manual_override_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON manual_override_log TO service_role;
GRANT SELECT ON manual_override_log TO authenticated;
REVOKE ALL ON manual_override_log FROM anon;

-- ─── Notify PostgREST to reload schema cache ──────────────────────────────────
NOTIFY pgrst, 'reload schema';
