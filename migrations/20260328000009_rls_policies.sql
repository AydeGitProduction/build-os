-- ============================================================
-- BUILD OS — Migration 009: Row Level Security Policies
-- ============================================================
-- Prerequisite: Migrations 001–008 applied
-- Apply BEFORE opening any API endpoints
-- ============================================================

-- ─── RLS Helper Functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION buildos_current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION buildos_current_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM workspaces
  WHERE organization_id = buildos_current_org_id()
  AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION buildos_current_project_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM projects
  WHERE workspace_id IN (SELECT buildos_current_workspace_ids())
  AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION buildos_current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;

-- ─── Convenience: Safe credentials view (excludes encrypted_values) ───────────
CREATE OR REPLACE VIEW credentials_safe_view AS
SELECT
  id, workspace_id, provider_id, label,
  encryption_key_ref, is_active, expires_at,
  created_by, created_at, updated_at
  -- encrypted_values INTENTIONALLY EXCLUDED
FROM credentials;

COMMENT ON VIEW credentials_safe_view IS
  'Safe view of credentials — encrypted_values column excluded. All UI and agent queries MUST use this view.';

-- ─── GROUP 1: WORKSPACE & PROJECTS ───────────────────────────────────────────

-- organizations
CREATE POLICY org_select_own        ON organizations FOR SELECT USING (id = buildos_current_org_id());
CREATE POLICY org_insert_never      ON organizations FOR INSERT WITH CHECK (false);
CREATE POLICY org_update_owner_only ON organizations FOR UPDATE USING (id = buildos_current_org_id() AND buildos_current_user_role() = 'owner');
CREATE POLICY org_delete_never      ON organizations FOR DELETE USING (false);

-- users
CREATE POLICY users_select_own_org         ON users FOR SELECT USING (organization_id = buildos_current_org_id());
CREATE POLICY users_insert_own_org         ON users FOR INSERT WITH CHECK (organization_id = buildos_current_org_id());
CREATE POLICY users_update_self_or_admin   ON users FOR UPDATE USING (id = auth.uid() OR buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY users_delete_admin_only      ON users FOR DELETE USING (buildos_current_user_role() = 'owner' AND id <> auth.uid());

-- workspaces
CREATE POLICY ws_select_own_org  ON workspaces FOR SELECT USING (organization_id = buildos_current_org_id() AND deleted_at IS NULL);
CREATE POLICY ws_insert_admin    ON workspaces FOR INSERT WITH CHECK (organization_id = buildos_current_org_id() AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ws_update_admin    ON workspaces FOR UPDATE USING (organization_id = buildos_current_org_id() AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ws_delete_never    ON workspaces FOR DELETE USING (false);

-- projects
CREATE POLICY proj_select_workspace ON projects FOR SELECT USING (workspace_id IN (SELECT buildos_current_workspace_ids()) AND deleted_at IS NULL);
CREATE POLICY proj_insert_admin     ON projects FOR INSERT WITH CHECK (workspace_id IN (SELECT buildos_current_workspace_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY proj_update_admin     ON projects FOR UPDATE USING (workspace_id IN (SELECT buildos_current_workspace_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY proj_delete_never     ON projects FOR DELETE USING (false);

-- project_environments
CREATE POLICY env_select_member ON project_environments FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY env_insert_admin  ON project_environments FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY env_update_admin  ON project_environments FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY env_delete_admin  ON project_environments FOR DELETE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));

-- project_settings
CREATE POLICY ps_select_member ON project_settings FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY ps_insert_admin  ON project_settings FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ps_update_admin  ON project_settings FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ps_delete_admin  ON project_settings FOR DELETE USING (false);

-- ─── GROUP 2: INTEGRATIONS ────────────────────────────────────────────────────

-- integration_providers (system-managed registry)
CREATE POLICY ip_select_authenticated ON integration_providers FOR SELECT USING (true);
CREATE POLICY ip_insert_never         ON integration_providers FOR INSERT WITH CHECK (false);
CREATE POLICY ip_update_never         ON integration_providers FOR UPDATE USING (false);
CREATE POLICY ip_delete_never         ON integration_providers FOR DELETE USING (false);

-- credentials (admin-only, encrypted_values never via RLS)
CREATE POLICY cred_select_admin  ON credentials FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE organization_id = buildos_current_org_id()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY cred_insert_admin  ON credentials FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE organization_id = buildos_current_org_id()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY cred_update_admin  ON credentials FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE organization_id = buildos_current_org_id()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY cred_delete_never  ON credentials FOR DELETE USING (false);

-- project_integrations
CREATE POLICY pi_select_member ON project_integrations FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY pi_insert_admin  ON project_integrations FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY pi_update_admin  ON project_integrations FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY pi_delete_never  ON project_integrations FOR DELETE USING (false);

-- ─── GROUP 3: QUESTIONNAIRE & BLUEPRINT ──────────────────────────────────────

-- questionnaires
CREATE POLICY q_select_member ON questionnaires FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY q_insert_admin  ON questionnaires FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY q_update_admin  ON questionnaires FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY q_delete_never  ON questionnaires FOR DELETE USING (false);

-- answers
CREATE POLICY ans_select_member ON answers FOR SELECT
  USING (questionnaire_id IN (SELECT id FROM questionnaires WHERE project_id IN (SELECT buildos_current_project_ids())));
CREATE POLICY ans_insert_member ON answers FOR INSERT
  WITH CHECK (questionnaire_id IN (SELECT id FROM questionnaires WHERE project_id IN (SELECT buildos_current_project_ids())));
CREATE POLICY ans_update_self   ON answers FOR UPDATE
  USING (answered_by = auth.uid());
CREATE POLICY ans_delete_never  ON answers FOR DELETE USING (false);

-- blueprints
CREATE POLICY bp_select_member ON blueprints FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY bp_insert_admin  ON blueprints FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY bp_update_admin  ON blueprints FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY bp_delete_never  ON blueprints FOR DELETE USING (false);

-- architecture_decisions
CREATE POLICY adr_select_member ON architecture_decisions FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY adr_insert_admin  ON architecture_decisions FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY adr_update_admin  ON architecture_decisions FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY adr_delete_never  ON architecture_decisions FOR DELETE USING (false);

-- ─── GROUP 4: EXECUTION ───────────────────────────────────────────────────────

-- epics
CREATE POLICY epics_select_member ON epics FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY epics_insert_admin  ON epics FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY epics_update_admin  ON epics FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY epics_delete_never  ON epics FOR DELETE USING (false);

-- features
CREATE POLICY feat_select_member ON features FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY feat_insert_admin  ON features FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY feat_update_admin  ON features FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY feat_delete_never  ON features FOR DELETE USING (false);

-- tasks
CREATE POLICY task_select_member ON tasks FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY task_insert_admin  ON tasks FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY task_update_admin  ON tasks FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY task_delete_never  ON tasks FOR DELETE USING (false);

-- task_dependencies
CREATE POLICY td_select_member ON task_dependencies FOR SELECT
  USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT buildos_current_project_ids())));
CREATE POLICY td_insert_admin  ON task_dependencies FOR INSERT
  WITH CHECK (task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT buildos_current_project_ids())) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY td_delete_admin  ON task_dependencies FOR DELETE
  USING (task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT buildos_current_project_ids())) AND buildos_current_user_role() IN ('owner','admin'));

-- task_runs — read only for users; writes via service_role only
CREATE POLICY run_select_member ON task_runs FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY run_insert_never  ON task_runs FOR INSERT WITH CHECK (false);
CREATE POLICY run_update_never  ON task_runs FOR UPDATE USING (false);
CREATE POLICY run_delete_never  ON task_runs FOR DELETE USING (false);

-- agent_outputs — read only for users; writes via service_role only
CREATE POLICY ao_select_member ON agent_outputs FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY ao_insert_never  ON agent_outputs FOR INSERT WITH CHECK (false);
CREATE POLICY ao_update_never  ON agent_outputs FOR UPDATE USING (false);
CREATE POLICY ao_delete_never  ON agent_outputs FOR DELETE USING (false);

-- ─── GROUP 5: DOCUMENTATION ───────────────────────────────────────────────────

-- documents
CREATE POLICY doc_select_member ON documents FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY doc_insert_admin  ON documents FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY doc_update_admin  ON documents FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY doc_delete_never  ON documents FOR DELETE USING (false);

-- artifacts — read by members, write by service_role only
CREATE POLICY art_select_member ON artifacts FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY art_insert_never  ON artifacts FOR INSERT WITH CHECK (false);
CREATE POLICY art_delete_admin  ON artifacts FOR DELETE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));

-- schema_registry — append-only; members can read
CREATE POLICY sr_select_member ON schema_registry FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY sr_insert_admin  ON schema_registry FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY sr_update_never  ON schema_registry FOR UPDATE USING (false);
CREATE POLICY sr_delete_never  ON schema_registry FOR DELETE USING (false);

-- api_contracts
CREATE POLICY ac_select_member ON api_contracts FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY ac_insert_admin  ON api_contracts FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ac_update_admin  ON api_contracts FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ac_delete_never  ON api_contracts FOR DELETE USING (false);

-- ─── GROUP 6: QA & RELEASE ────────────────────────────────────────────────────

-- qa_verdicts — read by members, write by service_role only
CREATE POLICY qa_select_member ON qa_verdicts FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY qa_insert_never  ON qa_verdicts FOR INSERT WITH CHECK (false);
CREATE POLICY qa_update_never  ON qa_verdicts FOR UPDATE USING (false);
CREATE POLICY qa_delete_never  ON qa_verdicts FOR DELETE USING (false);

-- release_readiness
CREATE POLICY rr_select_member ON release_readiness FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY rr_insert_admin  ON release_readiness FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY rr_update_admin  ON release_readiness FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY rr_delete_never  ON release_readiness FOR DELETE USING (false);

-- blockers
CREATE POLICY bl_select_member ON blockers FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY bl_insert_admin  ON blockers FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY bl_update_assignee ON blockers FOR UPDATE
  USING (project_id IN (SELECT buildos_current_project_ids()) AND (assigned_to = auth.uid() OR buildos_current_user_role() IN ('owner','admin')));
CREATE POLICY bl_delete_never  ON blockers FOR DELETE USING (false);

-- ─── GROUP 7: COST ────────────────────────────────────────────────────────────

-- cost_models — admin only
CREATE POLICY cm_select_admin ON cost_models FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY cm_insert_never ON cost_models FOR INSERT WITH CHECK (false);
CREATE POLICY cm_update_never ON cost_models FOR UPDATE USING (false);
CREATE POLICY cm_delete_never ON cost_models FOR DELETE USING (false);

-- cost_events — admin reads, service_role writes (append-only already enforced by RULE)
CREATE POLICY ce_select_admin ON cost_events FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY ce_insert_never ON cost_events FOR INSERT WITH CHECK (false);

-- cost_estimates
CREATE POLICY cest_select_admin ON cost_estimates FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY cest_insert_admin ON cost_estimates FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY cest_update_admin ON cost_estimates FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY cest_delete_never ON cost_estimates FOR DELETE USING (false);

-- ─── GROUP 8: RECOMMENDATIONS ────────────────────────────────────────────────

-- recommendation_reports — admin reads, service_role writes
CREATE POLICY rec_select_admin ON recommendation_reports FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY rec_insert_never ON recommendation_reports FOR INSERT WITH CHECK (false);
CREATE POLICY rec_update_admin ON recommendation_reports FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY rec_delete_never ON recommendation_reports FOR DELETE USING (false);

-- ─── GROUP 9: DEPLOYMENT ──────────────────────────────────────────────────────

-- domains
CREATE POLICY dom_select_member ON domains FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY dom_insert_admin  ON domains FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY dom_update_admin  ON domains FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY dom_delete_admin  ON domains FOR DELETE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));

-- deployment_targets
CREATE POLICY dt_select_member ON deployment_targets FOR SELECT USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY dt_insert_admin  ON deployment_targets FOR INSERT WITH CHECK (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY dt_update_admin  ON deployment_targets FOR UPDATE USING (project_id IN (SELECT buildos_current_project_ids()) AND buildos_current_user_role() IN ('owner','admin'));
CREATE POLICY dt_delete_never  ON deployment_targets FOR DELETE USING (false);

-- ─── SMOKE TEST QUERIES (run these after applying in staging) ────────────────
-- As an owner user:
--   SELECT count(*) FROM organizations;              -- should return 1
--   SELECT count(*) FROM credentials_safe_view;      -- should return owned workspace creds only
--   SELECT encrypted_values FROM credentials LIMIT 1; -- should fail (RLS + view design)
--
-- As service_role:
--   Any query bypasses RLS entirely -- expected.
