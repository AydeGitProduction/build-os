-- ============================================================
-- BUILD OS — Migration 004: Execution Layer
-- ============================================================

-- ─── epics ───────────────────────────────────────────────────────────────────
CREATE TABLE epics (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  title       text        NOT NULL,
  description text,
  status      text        NOT NULL DEFAULT 'pending',
  order_index integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT epics_pkey           PRIMARY KEY (id),
  CONSTRAINT epics_project_fk     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT epics_status_check   CHECK (status IN ('pending','in_progress','completed','cancelled'))
);

CREATE INDEX idx_epics_project_id ON epics (project_id);

CREATE TRIGGER epics_updated_at
  BEFORE UPDATE ON epics
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE epics ENABLE ROW LEVEL SECURITY;

-- ─── features ────────────────────────────────────────────────────────────────
CREATE TABLE features (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  epic_id             uuid        NOT NULL,
  project_id          uuid        NOT NULL,
  title               text        NOT NULL,
  description         text,
  acceptance_criteria jsonb       NOT NULL DEFAULT '[]',
  status              text        NOT NULL DEFAULT 'pending',
  priority            text        NOT NULL DEFAULT 'medium',
  order_index         integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT features_pkey            PRIMARY KEY (id),
  CONSTRAINT features_epic_fk         FOREIGN KEY (epic_id)    REFERENCES epics(id)    ON DELETE CASCADE,
  CONSTRAINT features_project_fk      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT features_status_check    CHECK (status   IN ('pending','in_progress','completed','cancelled')),
  CONSTRAINT features_priority_check  CHECK (priority IN ('critical','high','medium','low'))
);

CREATE INDEX idx_features_epic_id    ON features (epic_id);
CREATE INDEX idx_features_project_id ON features (project_id);

CREATE TRIGGER features_updated_at
  BEFORE UPDATE ON features
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE features ENABLE ROW LEVEL SECURITY;

-- ─── tasks ───────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id                      uuid            NOT NULL DEFAULT gen_random_uuid(),
  feature_id              uuid            NOT NULL,
  project_id              uuid            NOT NULL,
  title                   text            NOT NULL,
  description             text,
  agent_role              text            NOT NULL,
  status                  text            NOT NULL DEFAULT 'pending',
  task_type               text            NOT NULL,
  priority                text            NOT NULL DEFAULT 'medium',
  context_payload         jsonb           NOT NULL DEFAULT '{}',
  expected_output_schema  jsonb,
  retry_count             integer         NOT NULL DEFAULT 0,
  max_retries             integer         NOT NULL DEFAULT 3,
  estimated_cost_usd      numeric(10,4),
  actual_cost_usd         numeric(10,4),
  dispatched_at           timestamptz,
  completed_at            timestamptz,
  order_index             integer         NOT NULL DEFAULT 0,
  created_at              timestamptz     NOT NULL DEFAULT now(),
  updated_at              timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT tasks_pkey               PRIMARY KEY (id),
  CONSTRAINT tasks_feature_fk         FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE,
  CONSTRAINT tasks_project_fk         FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT tasks_status_check       CHECK (status IN ('pending','ready','dispatched','in_progress','awaiting_review','in_qa','blocked','failed','completed','cancelled')),
  CONSTRAINT tasks_type_check         CHECK (task_type IN ('code','schema','document','test','review','deploy','design')),
  CONSTRAINT tasks_priority_check     CHECK (priority  IN ('critical','high','medium','low')),
  CONSTRAINT tasks_agent_role_check   CHECK (agent_role IN ('orchestrator','architect','product_analyst','backend_engineer','frontend_engineer','automation_engineer','integration_engineer','qa_security_auditor','documentation_engineer','cost_analyst','recommendation_analyst','release_manager')),
  CONSTRAINT tasks_retry_check        CHECK (retry_count <= max_retries)
);

CREATE INDEX idx_tasks_feature_id    ON tasks (feature_id);
CREATE INDEX idx_tasks_project_id    ON tasks (project_id);
CREATE INDEX idx_tasks_status        ON tasks (status);
CREATE INDEX idx_tasks_agent_role    ON tasks (agent_role);
CREATE INDEX idx_tasks_dispatched_at ON tasks (dispatched_at) WHERE dispatched_at IS NOT NULL;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ─── task_dependencies ───────────────────────────────────────────────────────
CREATE TABLE task_dependencies (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  task_id             uuid        NOT NULL,
  depends_on_task_id  uuid        NOT NULL,
  dependency_type     text        NOT NULL DEFAULT 'finish_to_start',
  is_hard             boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT task_dependencies_pkey     PRIMARY KEY (id),
  CONSTRAINT task_dependencies_uq       UNIQUE (task_id, depends_on_task_id),
  CONSTRAINT task_dependencies_task_fk  FOREIGN KEY (task_id)            REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_dependencies_dep_fk   FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_dependencies_no_self  CHECK (task_id <> depends_on_task_id),
  CONSTRAINT task_dependencies_type_ck  CHECK (dependency_type IN ('finish_to_start','start_to_start','finish_to_finish'))
);

CREATE INDEX idx_task_dependencies_task_id            ON task_dependencies (task_id);
CREATE INDEX idx_task_dependencies_depends_on_task_id ON task_dependencies (depends_on_task_id);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

-- ─── task_runs ───────────────────────────────────────────────────────────────
CREATE TABLE task_runs (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  task_id         uuid          NOT NULL,
  project_id      uuid          NOT NULL,
  attempt_number  integer       NOT NULL DEFAULT 1,
  agent_role      text          NOT NULL,
  status          text          NOT NULL,
  started_at      timestamptz,
  completed_at    timestamptz,
  duration_ms     integer,
  tokens_input    integer,
  tokens_output   integer,
  model_used      text,
  error_message   text,
  error_code      text,
  cost_usd        numeric(10,4),
  created_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT task_runs_pkey          PRIMARY KEY (id),
  CONSTRAINT task_runs_task_fk       FOREIGN KEY (task_id)    REFERENCES tasks(id)    ON DELETE CASCADE,
  CONSTRAINT task_runs_project_fk    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT task_runs_status_check  CHECK (status IN ('queued','started','streaming','validating','completed','failed','timed_out'))
);

CREATE INDEX idx_task_runs_task_id    ON task_runs (task_id);
CREATE INDEX idx_task_runs_project_id ON task_runs (project_id);
CREATE INDEX idx_task_runs_status     ON task_runs (status);
CREATE INDEX idx_task_runs_created_at ON task_runs (created_at DESC);

ALTER TABLE task_runs ENABLE ROW LEVEL SECURITY;

-- ─── agent_outputs ───────────────────────────────────────────────────────────
CREATE TABLE agent_outputs (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  task_run_id       uuid        NOT NULL,
  task_id           uuid        NOT NULL,
  project_id        uuid        NOT NULL,
  agent_role        text        NOT NULL,
  output_type       text        NOT NULL,
  content           jsonb       NOT NULL,
  raw_text          text,
  is_valid          boolean     NOT NULL DEFAULT true,
  validation_errors jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_outputs_pkey           PRIMARY KEY (id),
  CONSTRAINT agent_outputs_run_fk         FOREIGN KEY (task_run_id) REFERENCES task_runs(id) ON DELETE CASCADE,
  CONSTRAINT agent_outputs_task_fk        FOREIGN KEY (task_id)     REFERENCES tasks(id)     ON DELETE CASCADE,
  CONSTRAINT agent_outputs_project_fk     FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE,
  CONSTRAINT agent_outputs_type_check     CHECK (output_type IN ('code','schema','document','test','review','handoff','qa_verdict','invalid'))
);

CREATE INDEX idx_agent_outputs_task_run_id ON agent_outputs (task_run_id);
CREATE INDEX idx_agent_outputs_task_id     ON agent_outputs (task_id);
CREATE INDEX idx_agent_outputs_project_id  ON agent_outputs (project_id);
CREATE INDEX idx_agent_outputs_is_valid    ON agent_outputs (is_valid) WHERE is_valid = false;

ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;
