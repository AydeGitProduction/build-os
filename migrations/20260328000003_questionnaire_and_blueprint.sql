-- ============================================================
-- BUILD OS — Migration 003: Questionnaire & Blueprint
-- ============================================================

-- ─── questionnaires ──────────────────────────────────────────────────────────
CREATE TABLE questionnaires (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL,
  version       integer     NOT NULL DEFAULT 1,
  status        text        NOT NULL DEFAULT 'active',
  questions     jsonb       NOT NULL DEFAULT '[]',
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT questionnaires_pkey          PRIMARY KEY (id),
  CONSTRAINT questionnaires_proj_ver_uq   UNIQUE (project_id, version),
  CONSTRAINT questionnaires_project_fk    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT questionnaires_status_check  CHECK (status IN ('active','completed','superseded'))
);

CREATE INDEX idx_questionnaires_project_id ON questionnaires (project_id);

CREATE TRIGGER questionnaires_updated_at
  BEFORE UPDATE ON questionnaires
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

-- ─── answers ─────────────────────────────────────────────────────────────────
CREATE TABLE answers (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  questionnaire_id    uuid        NOT NULL,
  question_id         text        NOT NULL,
  answered_by         uuid        NOT NULL,
  value               jsonb       NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT answers_pkey          PRIMARY KEY (id),
  CONSTRAINT answers_q_qid_uq      UNIQUE (questionnaire_id, question_id),
  CONSTRAINT answers_q_fk          FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE,
  CONSTRAINT answers_user_fk       FOREIGN KEY (answered_by)      REFERENCES users(id)          ON DELETE RESTRICT
);

CREATE INDEX idx_answers_questionnaire_id ON answers (questionnaire_id);

CREATE TRIGGER answers_updated_at
  BEFORE UPDATE ON answers
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- ─── blueprints ───────────────────────────────────────────────────────────────
CREATE TABLE blueprints (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id                  uuid        NOT NULL,
  questionnaire_id            uuid        NOT NULL,
  version                     integer     NOT NULL DEFAULT 1,
  status                      text        NOT NULL DEFAULT 'draft',
  summary                     text,
  goals                       jsonb       NOT NULL DEFAULT '[]',
  non_goals                   jsonb       NOT NULL DEFAULT '[]',
  user_personas               jsonb       NOT NULL DEFAULT '[]',
  feature_list                jsonb       NOT NULL DEFAULT '[]',
  tech_stack_recommendation   jsonb       NOT NULL DEFAULT '{}',
  risk_flags                  jsonb       NOT NULL DEFAULT '[]',
  generated_by_agent          text,
  accepted_by                 uuid,
  accepted_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT blueprints_pkey            PRIMARY KEY (id),
  CONSTRAINT blueprints_proj_ver_uq     UNIQUE (project_id, version),
  CONSTRAINT blueprints_project_fk      FOREIGN KEY (project_id)       REFERENCES projects(id)        ON DELETE CASCADE,
  CONSTRAINT blueprints_q_fk            FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id)  ON DELETE RESTRICT,
  CONSTRAINT blueprints_acceptor_fk     FOREIGN KEY (accepted_by)      REFERENCES users(id)           ON DELETE SET NULL,
  CONSTRAINT blueprints_status_check    CHECK (status IN ('draft','accepted','superseded'))
);

CREATE INDEX idx_blueprints_project_id ON blueprints (project_id);

CREATE TRIGGER blueprints_updated_at
  BEFORE UPDATE ON blueprints
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;

-- ─── architecture_decisions ──────────────────────────────────────────────────
CREATE TABLE architecture_decisions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  number          integer     NOT NULL,
  title           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'draft',
  context         text        NOT NULL,
  decision        text        NOT NULL,
  consequences    text,
  superseded_by   uuid,
  created_by      uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT architecture_decisions_pkey        PRIMARY KEY (id),
  CONSTRAINT architecture_decisions_proj_num_uq UNIQUE (project_id, number),
  CONSTRAINT architecture_decisions_project_fk  FOREIGN KEY (project_id)    REFERENCES projects(id)               ON DELETE CASCADE,
  CONSTRAINT architecture_decisions_super_fk    FOREIGN KEY (superseded_by) REFERENCES architecture_decisions(id) ON DELETE SET NULL,
  CONSTRAINT architecture_decisions_creator_fk  FOREIGN KEY (created_by)    REFERENCES users(id)                  ON DELETE RESTRICT,
  CONSTRAINT architecture_decisions_status_check CHECK (status IN ('draft','accepted','superseded','deprecated'))
);

CREATE INDEX idx_architecture_decisions_project_id ON architecture_decisions (project_id);

CREATE TRIGGER architecture_decisions_updated_at
  BEFORE UPDATE ON architecture_decisions
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE architecture_decisions ENABLE ROW LEVEL SECURITY;
