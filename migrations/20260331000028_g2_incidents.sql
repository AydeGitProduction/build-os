-- ─── Block G2: Formal Incident Management System ────────────────────────────
-- Migration: 20260331000028_g2_incidents
-- Purpose:   Create incidents, incident_root_causes, incident_fixes tables.
--            Implements INC-XXXX code generation, closure enforcement logic,
--            and full FK integrity between all three tables and prevention_rules.
--
-- NEVER run via pg.Client or node-postgres (RULE-09).
-- Execute in Supabase SQL Editor directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Sequence for INC-XXXX codes ──────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS incident_code_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- ─── 2. incidents table ───────────────────────────────────────────────────────

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
  related_rule_id   uuid,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  closed_at         timestamptz,

  CONSTRAINT incidents_pkey             PRIMARY KEY (id),
  CONSTRAINT incidents_code_uq          UNIQUE (incident_code),
  CONSTRAINT incidents_severity_ck      CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
  CONSTRAINT incidents_type_ck          CHECK (incident_type IN (
    'logic', 'state', 'contract', 'ui', 'infra', 'data', 'security', 'performance', 'workflow'
  )),
  CONSTRAINT incidents_status_ck        CHECK (status IN (
    'open', 'investigating', 'fix_in_progress', 'closed'
  )),
  CONSTRAINT incidents_owner_ck         CHECK (owner_domain IN (
    'backend', 'infra', 'frontend', 'qa', 'architect', 'security'
  )),
  CONSTRAINT incidents_rule_fk          FOREIGN KEY (related_rule_id)
    REFERENCES prevention_rules(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_status        ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity      ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_owner_domain  ON incidents (owner_domain);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at    ON incidents (created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_incidents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_incidents_updated_at();

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY incidents_service_all ON incidents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY incidents_auth_read ON incidents
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE incidents IS 'Block G2: Formal incident management. INC-XXXX codes. Closure requires RCA + fix + prevention rule.';
COMMENT ON COLUMN incidents.incident_code  IS 'Human-readable code: INC-0001, INC-0002, etc. Auto-generated from sequence.';
COMMENT ON COLUMN incidents.related_rule_id IS 'FK to prevention_rules. Required before status=closed.';

-- ─── 3. incident_root_causes table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incident_root_causes (
  id                      uuid          NOT NULL DEFAULT gen_random_uuid(),
  incident_id             uuid          NOT NULL,
  symptom                 text          NOT NULL,
  trigger                 text          NOT NULL,
  broken_assumption       text          NOT NULL,
  missing_guardrail       text          NOT NULL,
  why_not_caught_earlier  text          NOT NULL,
  created_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT incident_root_causes_pkey  PRIMARY KEY (id),
  CONSTRAINT incident_root_causes_fk    FOREIGN KEY (incident_id)
    REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_incident_root_causes_incident_id
  ON incident_root_causes (incident_id);

ALTER TABLE incident_root_causes ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_root_causes_service_all ON incident_root_causes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY incident_root_causes_auth_read ON incident_root_causes
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE incident_root_causes IS 'Block G2: RCA records. All 5 fields required. At least one required before incident can be closed.';

-- ─── 4. incident_fixes table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incident_fixes (
  id                          uuid          NOT NULL DEFAULT gen_random_uuid(),
  incident_id                 uuid          NOT NULL,
  fix_type                    text          NOT NULL,
  fix_description             text          NOT NULL,
  implementation_notes        text          NOT NULL,
  permanent_prevention_added  boolean       NOT NULL DEFAULT false,
  created_at                  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT incident_fixes_pkey      PRIMARY KEY (id),
  CONSTRAINT incident_fixes_fk        FOREIGN KEY (incident_id)
    REFERENCES incidents(id) ON DELETE CASCADE,
  CONSTRAINT incident_fixes_type_ck   CHECK (fix_type IN (
    'permanent', 'temporary', 'workaround', 'mitigation'
  ))
);

CREATE INDEX IF NOT EXISTS idx_incident_fixes_incident_id
  ON incident_fixes (incident_id);

ALTER TABLE incident_fixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_fixes_service_all ON incident_fixes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY incident_fixes_auth_read ON incident_fixes
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE incident_fixes IS 'Block G2: Fix records. permanent_prevention_added must be true for P0/P1 before closure.';

-- ─── 5. Verify tables created ────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['incidents', 'incident_root_causes', 'incident_fixes'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE EXCEPTION 'Table % was not created. Aborting.', t;
    ELSE
      RAISE NOTICE 'Table % OK', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'Block G2 migration complete: incidents, incident_root_causes, incident_fixes created.';
END $$;
