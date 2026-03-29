-- ============================================================
-- BUILD OS — Migration 012: JSONB Normalization
-- ============================================================
-- NON-BREAKING: all original JSONB columns retained during
-- transition period. Drop in Phase 3 post-verification.
-- ============================================================

-- ─── 012a: project_tech_stack_items ──────────────────────────────────────────
-- Replaces: projects.tech_stack (jsonb array of strings)
CREATE TABLE project_tech_stack_items (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  category    text        NOT NULL DEFAULT 'other',
  name        text        NOT NULL,
  version     text,
  order_index integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pti_pkey           PRIMARY KEY (id),
  CONSTRAINT pti_project_fk     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT pti_proj_name_uq   UNIQUE (project_id, category, name),
  CONSTRAINT pti_category_check CHECK (category IN ('frontend','backend','database','ai','devops','testing','infra','other'))
);

CREATE INDEX idx_pti_project_id ON project_tech_stack_items (project_id);
ALTER TABLE project_tech_stack_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY pti_select_member ON project_tech_stack_items FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY pti_insert_admin  ON project_tech_stack_items FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY pti_update_admin  ON project_tech_stack_items FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY pti_delete_admin  ON project_tech_stack_items FOR DELETE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));

-- Backfill from projects.tech_stack (each string becomes a row with category='other')
-- Run AFTER table creation and BEFORE dropping tech_stack column:
-- INSERT INTO project_tech_stack_items (project_id, category, name)
-- SELECT id, 'other', jsonb_array_elements_text(tech_stack)
-- FROM projects
-- WHERE tech_stack IS NOT NULL AND jsonb_array_length(tech_stack) > 0
-- ON CONFLICT (project_id, category, name) DO NOTHING;

-- ─── 012b: blueprint_features ────────────────────────────────────────────────
-- Replaces: blueprints.feature_list (jsonb array)
CREATE TABLE blueprint_features (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  blueprint_id  uuid        NOT NULL,
  project_id    uuid        NOT NULL,
  title         text        NOT NULL,
  description   text,
  priority      text        NOT NULL DEFAULT 'medium',
  order_index   integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bf_pkey           PRIMARY KEY (id),
  CONSTRAINT bf_blueprint_fk   FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE,
  CONSTRAINT bf_project_fk     FOREIGN KEY (project_id)   REFERENCES projects(id)   ON DELETE CASCADE,
  CONSTRAINT bf_priority_check CHECK (priority IN ('critical','high','medium','low'))
);

CREATE INDEX idx_bf_blueprint_id ON blueprint_features (blueprint_id);
CREATE INDEX idx_bf_project_id   ON blueprint_features (project_id);
ALTER TABLE blueprint_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY bf_select_member ON blueprint_features FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY bf_insert_admin  ON blueprint_features FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY bf_update_admin  ON blueprint_features FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY bf_delete_never  ON blueprint_features FOR DELETE USING (false);

-- ─── 012c: blueprint_stack_recommendations ───────────────────────────────────
-- Replaces: blueprints.tech_stack_recommendation (nested jsonb object)
CREATE TABLE blueprint_stack_recommendations (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  blueprint_id  uuid        NOT NULL,
  project_id    uuid        NOT NULL,
  layer         text        NOT NULL,
  tool          text        NOT NULL,
  reasoning     text,
  classification text       NOT NULL DEFAULT 'RECOMMENDED',
  order_index   integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bsr_pkey                PRIMARY KEY (id),
  CONSTRAINT bsr_blueprint_fk        FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE,
  CONSTRAINT bsr_project_fk          FOREIGN KEY (project_id)   REFERENCES projects(id)   ON DELETE CASCADE,
  CONSTRAINT bsr_layer_tool_uq       UNIQUE (blueprint_id, layer, tool),
  CONSTRAINT bsr_classification_check CHECK (classification IN ('REQUIRED_NOW','RECOMMENDED','OPTIONAL','OVERKILL','REQUIRED_AT_SCALE'))
);

CREATE INDEX idx_bsr_blueprint_id ON blueprint_stack_recommendations (blueprint_id);
ALTER TABLE blueprint_stack_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY bsr_select_member ON blueprint_stack_recommendations FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY bsr_insert_admin  ON blueprint_stack_recommendations FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY bsr_update_admin  ON blueprint_stack_recommendations FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY bsr_delete_never  ON blueprint_stack_recommendations FOR DELETE USING (false);

-- ─── 012d: recommendation_items ──────────────────────────────────────────────
-- Replaces: recommendation_reports.items (jsonb array)
CREATE TABLE recommendation_items (
  id                          uuid          NOT NULL DEFAULT gen_random_uuid(),
  report_id                   uuid          NOT NULL,
  project_id                  uuid          NOT NULL,
  category                    text          NOT NULL,
  tool                        text          NOT NULL,
  classification              text          NOT NULL,
  reasoning                   text          NOT NULL CHECK (length(reasoning) >= 20),
  estimated_cost_impact_usd   numeric(10,4),
  signal                      text,
  created_at                  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT ri_pkey                  PRIMARY KEY (id),
  CONSTRAINT ri_report_fk             FOREIGN KEY (report_id)  REFERENCES recommendation_reports(id) ON DELETE CASCADE,
  CONSTRAINT ri_project_fk            FOREIGN KEY (project_id) REFERENCES projects(id)               ON DELETE CASCADE,
  CONSTRAINT ri_classification_check  CHECK (classification IN ('REQUIRED_NOW','RECOMMENDED','OPTIONAL','OVERKILL','REQUIRED_AT_SCALE'))
);

CREATE INDEX idx_ri_report_id      ON recommendation_items (report_id);
CREATE INDEX idx_ri_classification ON recommendation_items (classification);
ALTER TABLE recommendation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ri_select_admin ON recommendation_items FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ri_insert_never ON recommendation_items FOR INSERT WITH CHECK (false); -- service_role only
CREATE POLICY ri_update_never ON recommendation_items FOR UPDATE USING (false);
CREATE POLICY ri_delete_never ON recommendation_items FOR DELETE USING (false);

-- ─── 012e: integration_environment_credentials ───────────────────────────────
-- Replaces: project_integrations.environment_map (jsonb mapping env → credential_id)
CREATE TABLE integration_environment_credentials (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  integration_id  uuid        NOT NULL,
  environment     text        NOT NULL,
  credential_id   uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT iec_pkey       PRIMARY KEY (id),
  CONSTRAINT iec_int_fk     FOREIGN KEY (integration_id) REFERENCES project_integrations(id) ON DELETE CASCADE,
  CONSTRAINT iec_cred_fk    FOREIGN KEY (credential_id)  REFERENCES credentials(id)          ON DELETE RESTRICT,
  CONSTRAINT iec_int_env_uq UNIQUE (integration_id, environment),
  CONSTRAINT iec_env_check  CHECK (environment IN ('development','staging','production'))
);

CREATE INDEX idx_iec_integration_id ON integration_environment_credentials (integration_id);
ALTER TABLE integration_environment_credentials ENABLE ROW LEVEL SECURITY;

-- Admin can see environment credential mappings (not the credential values — those are protected by credentials RLS)
CREATE POLICY iec_select_admin ON integration_environment_credentials FOR SELECT
  USING (integration_id IN (SELECT id FROM project_integrations WHERE project_id IN (SELECT buildos_current_project_ids())) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY iec_insert_admin ON integration_environment_credentials FOR INSERT
  WITH CHECK (buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY iec_update_admin ON integration_environment_credentials FOR UPDATE
  USING (buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY iec_delete_admin ON integration_environment_credentials FOR DELETE
  USING (buildos_current_user_role() IN ('owner','admin'));

-- ─── 012f: jsonb_output_schemas — per output_type schema registry ─────────────
-- Provides the expected JSON Schema per agent output_type for validation
CREATE TABLE jsonb_output_schemas (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  output_type   text        NOT NULL,
  version       integer     NOT NULL DEFAULT 1,
  json_schema   jsonb       NOT NULL,
  is_current    boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT jos_pkey          PRIMARY KEY (id),
  CONSTRAINT jos_type_ver_uq   UNIQUE (output_type, version),
  CONSTRAINT jos_type_check    CHECK (output_type IN ('code','schema','document','test','review','handoff','qa_verdict'))
);

ALTER TABLE jsonb_output_schemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY jos_select_all ON jsonb_output_schemas FOR SELECT USING (true);
CREATE POLICY jos_insert_never ON jsonb_output_schemas FOR INSERT WITH CHECK (false);

-- Seed minimal schemas for each output type
INSERT INTO jsonb_output_schemas (output_type, version, json_schema) VALUES
('code', 1, '{"type":"object","required":["language","files"],"properties":{"language":{"type":"string"},"files":{"type":"array","items":{"type":"object","required":["path","content"],"properties":{"path":{"type":"string"},"content":{"type":"string"},"description":{"type":"string"}}}}}}'),
('schema', 1, '{"type":"object","required":["migration_sql","table_names"],"properties":{"migration_sql":{"type":"string"},"table_names":{"type":"array","items":{"type":"string"}},"rollback_sql":{"type":"string"}}}'),
('document', 1, '{"type":"object","required":["document_type","title","content"],"properties":{"document_type":{"type":"string"},"title":{"type":"string"},"content":{"type":"string"},"version":{"type":"integer"}}}'),
('test', 1, '{"type":"object","required":["test_file_path","framework","test_count"],"properties":{"test_file_path":{"type":"string"},"framework":{"type":"string"},"test_count":{"type":"integer"},"content":{"type":"string"}}}'),
('review', 1, '{"type":"object","required":["summary","issues","approved"],"properties":{"summary":{"type":"string"},"issues":{"type":"array"},"approved":{"type":"boolean"},"recommendations":{"type":"array"}}}'),
('handoff', 1, '{"type":"object","required":["from_role","to_role","instructions","context_summary"],"properties":{"from_role":{"type":"string"},"to_role":{"type":"string"},"instructions":{"type":"string"},"context_summary":{"type":"string"}}}'),
('qa_verdict', 1, '{"type":"object","required":["verdict","score","issues"],"properties":{"verdict":{"type":"string","enum":["PASS","FAIL","CONDITIONAL_PASS"]},"score":{"type":"integer","minimum":1,"maximum":100},"issues":{"type":"array"},"security_flags":{"type":"array"}}}');
