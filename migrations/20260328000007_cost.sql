-- ============================================================
-- BUILD OS — Migration 007: Cost Engine
-- ============================================================

-- ─── cost_models ─────────────────────────────────────────────────────────────
CREATE TABLE cost_models (
  id                    uuid            NOT NULL DEFAULT gen_random_uuid(),
  project_id            uuid            NOT NULL,
  total_spend_usd       numeric(12,4)   NOT NULL DEFAULT 0,
  ai_usage_usd          numeric(12,4)   NOT NULL DEFAULT 0,
  automation_usd        numeric(12,4)   NOT NULL DEFAULT 0,
  infrastructure_usd    numeric(12,4)   NOT NULL DEFAULT 0,
  saas_usd              numeric(12,4)   NOT NULL DEFAULT 0,
  storage_usd           numeric(12,4)   NOT NULL DEFAULT 0,
  projected_monthly_usd numeric(12,4),
  budget_usd            numeric(12,4),
  last_calculated_at    timestamptz     NOT NULL DEFAULT now(),
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT cost_models_pkey         PRIMARY KEY (id),
  CONSTRAINT cost_models_project_uq   UNIQUE (project_id),
  CONSTRAINT cost_models_project_fk   FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TRIGGER cost_models_updated_at
  BEFORE UPDATE ON cost_models
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE cost_models ENABLE ROW LEVEL SECURITY;

-- ─── cost_events ─────────────────────────────────────────────────────────────
-- Immutable ledger. Never UPDATE, never DELETE.
CREATE TABLE cost_events (
  id              uuid            NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid            NOT NULL,
  task_run_id     uuid,
  category        text            NOT NULL,
  provider        text            NOT NULL,
  model           text,
  units           numeric(12,4)   NOT NULL,
  unit_label      text            NOT NULL,
  unit_cost_usd   numeric(14,8)   NOT NULL,
  total_cost_usd  numeric(12,4)   NOT NULL GENERATED ALWAYS AS (units * unit_cost_usd) STORED,
  metadata        jsonb           NOT NULL DEFAULT '{}',
  recorded_at     timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT cost_events_pkey           PRIMARY KEY (id),
  CONSTRAINT cost_events_project_fk     FOREIGN KEY (project_id)  REFERENCES projects(id)   ON DELETE CASCADE,
  CONSTRAINT cost_events_run_fk         FOREIGN KEY (task_run_id) REFERENCES task_runs(id)  ON DELETE SET NULL,
  CONSTRAINT cost_events_category_check CHECK (category IN ('AI_USAGE','AUTOMATION','INFRASTRUCTURE','SAAS','STORAGE')),
  CONSTRAINT cost_events_label_check    CHECK (unit_label IN ('tokens_input','tokens_output','executions','gb','requests'))
);

CREATE INDEX idx_cost_events_project_id   ON cost_events (project_id);
CREATE INDEX idx_cost_events_category     ON cost_events (category);
CREATE INDEX idx_cost_events_recorded_at  ON cost_events (recorded_at DESC);
CREATE INDEX idx_cost_events_task_run_id  ON cost_events (task_run_id) WHERE task_run_id IS NOT NULL;

-- Prevent updates and deletes — cost_events is append-only
CREATE RULE cost_events_no_update AS ON UPDATE TO cost_events DO INSTEAD NOTHING;
CREATE RULE cost_events_no_delete AS ON DELETE TO cost_events DO INSTEAD NOTHING;

ALTER TABLE cost_events ENABLE ROW LEVEL SECURITY;

-- ─── cost_estimates ──────────────────────────────────────────────────────────
CREATE TABLE cost_estimates (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid(),
  project_id          uuid            NOT NULL,
  task_id             uuid,
  estimate_type       text            NOT NULL,
  estimated_usd       numeric(12,4)   NOT NULL,
  confidence_level    text            NOT NULL DEFAULT 'medium',
  estimation_basis    jsonb           NOT NULL DEFAULT '{}',
  actual_usd          numeric(12,4),
  variance_pct        numeric(8,4) GENERATED ALWAYS AS (
    CASE WHEN actual_usd IS NOT NULL AND estimated_usd > 0
    THEN ((actual_usd - estimated_usd) / estimated_usd) * 100
    ELSE NULL END
  ) STORED,
  created_at          timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT cost_estimates_pkey              PRIMARY KEY (id),
  CONSTRAINT cost_estimates_project_fk        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT cost_estimates_task_fk           FOREIGN KEY (task_id)    REFERENCES tasks(id)    ON DELETE SET NULL,
  CONSTRAINT cost_estimates_type_check        CHECK (estimate_type IN ('task','feature','epic','project','monthly')),
  CONSTRAINT cost_estimates_confidence_check  CHECK (confidence_level IN ('low','medium','high'))
);

CREATE INDEX idx_cost_estimates_project_id ON cost_estimates (project_id);
CREATE INDEX idx_cost_estimates_task_id    ON cost_estimates (task_id) WHERE task_id IS NOT NULL;

ALTER TABLE cost_estimates ENABLE ROW LEVEL SECURITY;

-- ─── Trigger: auto-create cost_model row on project creation ─────────────────
CREATE OR REPLACE FUNCTION buildos_init_cost_model()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cost_models (project_id, budget_usd)
  VALUES (NEW.id, NEW.budget_usd)
  ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_init_cost_model
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION buildos_init_cost_model();
