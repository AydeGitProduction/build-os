-- ============================================================
-- BUILD OS — Migration 006: QA & Release
-- ============================================================

-- ─── qa_verdicts ─────────────────────────────────────────────────────────────
CREATE TABLE qa_verdicts (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  task_id             uuid        NOT NULL,
  agent_output_id     uuid        NOT NULL,
  project_id          uuid        NOT NULL,
  verdict             text        NOT NULL,
  score               integer,
  issues              jsonb       NOT NULL DEFAULT '[]',
  suggestions         jsonb       NOT NULL DEFAULT '[]',
  security_flags      jsonb       NOT NULL DEFAULT '[]',
  reviewed_by_agent   text        NOT NULL DEFAULT 'qa_security_auditor',
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qa_verdicts_pkey               PRIMARY KEY (id),
  CONSTRAINT qa_verdicts_task_fk            FOREIGN KEY (task_id)          REFERENCES tasks(id)         ON DELETE CASCADE,
  CONSTRAINT qa_verdicts_output_fk          FOREIGN KEY (agent_output_id)  REFERENCES agent_outputs(id) ON DELETE CASCADE,
  CONSTRAINT qa_verdicts_project_fk         FOREIGN KEY (project_id)       REFERENCES projects(id)      ON DELETE CASCADE,
  CONSTRAINT qa_verdicts_verdict_check      CHECK (verdict IN ('PASS','FAIL','CONDITIONAL_PASS')),
  CONSTRAINT qa_verdicts_score_check        CHECK (score BETWEEN 1 AND 100 OR score IS NULL)
);

CREATE INDEX idx_qa_verdicts_task_id    ON qa_verdicts (task_id);
CREATE INDEX idx_qa_verdicts_project_id ON qa_verdicts (project_id);
CREATE INDEX idx_qa_verdicts_verdict    ON qa_verdicts (verdict);

ALTER TABLE qa_verdicts ENABLE ROW LEVEL SECURITY;

-- ─── release_readiness ───────────────────────────────────────────────────────
CREATE TABLE release_readiness (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  release_version   text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  total_tasks       integer     NOT NULL DEFAULT 0,
  completed_tasks   integer     NOT NULL DEFAULT 0,
  failed_tasks      integer     NOT NULL DEFAULT 0,
  qa_pass_rate      numeric(5,2),
  approved_by       uuid,
  approved_at       timestamptz,
  deployed_at       timestamptz,
  deployment_url    text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT release_readiness_pkey             PRIMARY KEY (id),
  CONSTRAINT release_readiness_proj_ver_uq      UNIQUE (project_id, release_version),
  CONSTRAINT release_readiness_project_fk       FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT release_readiness_approver_fk      FOREIGN KEY (approved_by) REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT release_readiness_status_check     CHECK (status IN ('draft','readiness_check','awaiting_approval','deploying','deployed','rolled_back','blocked')),
  CONSTRAINT release_readiness_qa_rate_check    CHECK (qa_pass_rate BETWEEN 0 AND 100 OR qa_pass_rate IS NULL)
);

CREATE INDEX idx_release_readiness_project_id ON release_readiness (project_id);
CREATE INDEX idx_release_readiness_status     ON release_readiness (status);

CREATE TRIGGER release_readiness_updated_at
  BEFORE UPDATE ON release_readiness
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE release_readiness ENABLE ROW LEVEL SECURITY;

-- ─── blockers ────────────────────────────────────────────────────────────────
CREATE TABLE blockers (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  task_id           uuid,
  blocker_type      text        NOT NULL,
  severity          text        NOT NULL DEFAULT 'medium',
  description       text        NOT NULL,
  assigned_to       uuid,
  status            text        NOT NULL DEFAULT 'open',
  resolution_notes  text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT blockers_pkey              PRIMARY KEY (id),
  CONSTRAINT blockers_project_fk        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT blockers_task_fk           FOREIGN KEY (task_id)    REFERENCES tasks(id)    ON DELETE SET NULL,
  CONSTRAINT blockers_assignee_fk       FOREIGN KEY (assigned_to) REFERENCES users(id)   ON DELETE SET NULL,
  CONSTRAINT blockers_type_check        CHECK (blocker_type IN ('qa_fail','human_input','external_dependency','budget','error','missing_integration')),
  CONSTRAINT blockers_severity_check    CHECK (severity IN ('critical','high','medium','low')),
  CONSTRAINT blockers_status_check      CHECK (status IN ('open','in_progress','resolved','dismissed'))
);

CREATE INDEX idx_blockers_project_id  ON blockers (project_id);
CREATE INDEX idx_blockers_task_id     ON blockers (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_blockers_status      ON blockers (status) WHERE status IN ('open','in_progress');

CREATE TRIGGER blockers_updated_at
  BEFORE UPDATE ON blockers
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE blockers ENABLE ROW LEVEL SECURITY;
