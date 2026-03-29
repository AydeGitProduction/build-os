-- ============================================================
-- BUILD OS — Migration 005: Documentation
-- ============================================================

-- ─── documents ───────────────────────────────────────────────────────────────
CREATE TABLE documents (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  document_type     text        NOT NULL,
  title             text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  version           integer     NOT NULL DEFAULT 1,
  content           text,
  owner_agent_role  text,
  superseded_by     uuid,
  created_by        uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT documents_pkey           PRIMARY KEY (id),
  CONSTRAINT documents_project_fk     FOREIGN KEY (project_id)   REFERENCES projects(id)   ON DELETE CASCADE,
  CONSTRAINT documents_super_fk       FOREIGN KEY (superseded_by) REFERENCES documents(id)  ON DELETE SET NULL,
  CONSTRAINT documents_creator_fk     FOREIGN KEY (created_by)   REFERENCES users(id)       ON DELETE RESTRICT,
  CONSTRAINT documents_type_check     CHECK (document_type IN ('prd','architecture','adr','data_model','api_contract','automation','cost_model','qa_report','runbook','other')),
  CONSTRAINT documents_status_check   CHECK (status IN ('draft','in_review','accepted','superseded','deprecated'))
);

CREATE INDEX idx_documents_project_id     ON documents (project_id);
CREATE INDEX idx_documents_document_type  ON documents (document_type);
CREATE INDEX idx_documents_status         ON documents (status);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ─── artifacts ───────────────────────────────────────────────────────────────
CREATE TABLE artifacts (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  task_id         uuid,
  artifact_type   text        NOT NULL,
  filename        text        NOT NULL,
  storage_path    text        NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  checksum        text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT artifacts_pkey           PRIMARY KEY (id),
  CONSTRAINT artifacts_project_fk     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT artifacts_task_fk        FOREIGN KEY (task_id)    REFERENCES tasks(id)    ON DELETE SET NULL,
  CONSTRAINT artifacts_type_check     CHECK (artifact_type IN ('file','image','diagram','schema_dump','api_spec'))
);

CREATE INDEX idx_artifacts_project_id ON artifacts (project_id);
CREATE INDEX idx_artifacts_task_id    ON artifacts (task_id) WHERE task_id IS NOT NULL;

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;

-- ─── schema_registry ─────────────────────────────────────────────────────────
CREATE TABLE schema_registry (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  version     text        NOT NULL,
  description text        NOT NULL,
  sql_up      text        NOT NULL,
  sql_down    text,
  applied_at  timestamptz,
  applied_by  uuid,
  status      text        NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT schema_registry_pkey           PRIMARY KEY (id),
  CONSTRAINT schema_registry_proj_ver_uq    UNIQUE (project_id, version),
  CONSTRAINT schema_registry_project_fk     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT schema_registry_applier_fk     FOREIGN KEY (applied_by) REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT schema_registry_status_check   CHECK (status IN ('pending','applied','rolled_back','failed'))
);

CREATE INDEX idx_schema_registry_project_id ON schema_registry (project_id);

ALTER TABLE schema_registry ENABLE ROW LEVEL SECURITY;

-- ─── api_contracts ───────────────────────────────────────────────────────────
CREATE TABLE api_contracts (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  service_name    text        NOT NULL,
  version         text        NOT NULL,
  spec_format     text        NOT NULL DEFAULT 'openapi_3',
  spec_content    jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT api_contracts_pkey             PRIMARY KEY (id),
  CONSTRAINT api_contracts_svc_ver_uq       UNIQUE (project_id, service_name, version),
  CONSTRAINT api_contracts_project_fk       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT api_contracts_format_check     CHECK (spec_format IN ('openapi_3','graphql','asyncapi')),
  CONSTRAINT api_contracts_status_check     CHECK (status IN ('draft','active','deprecated'))
);

CREATE INDEX idx_api_contracts_project_id ON api_contracts (project_id);

CREATE TRIGGER api_contracts_updated_at
  BEFORE UPDATE ON api_contracts
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE api_contracts ENABLE ROW LEVEL SECURITY;
