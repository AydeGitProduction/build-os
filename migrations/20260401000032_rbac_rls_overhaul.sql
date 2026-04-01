-- ============================================================
-- BUILD OS — Migration 032: RLS Overhaul (Membership-Aware)
-- Epic: U1-A — Users / Roles / Permissions Foundation
-- ============================================================
-- WHAT THIS DOES:
--   1. Replaces org-scoped RLS helper functions with
--      membership-aware equivalents.
--   2. Drops all existing RLS policies on core tables.
--   3. Recreates policies using the new helper functions.
--   4. Adds RLS policies to the three new membership tables.
--
-- PREREQUISITE: Migration 031 applied + verified.
--
-- WARNING:
--   Dropping policies briefly opens tables if RLS is enabled.
--   Apply this migration as a single transaction in a maintenance
--   window OR apply via service_role (bypasses RLS).
--
-- DEVELOPER NOTES:
--   - After this migration, users.role is still present but
--     NO RLS policy reads it. It is deprecated and will be
--     removed in migration 034 once multi-user tests pass.
--   - The functions below are SECURITY DEFINER — they execute
--     as the function owner (postgres), not the calling user.
--     This is required to safely query membership tables.
-- ============================================================

BEGIN;

-- ─── 1. Replace RLS helper functions ─────────────────────────────────────────

-- Returns the calling user's role within a given organization.
-- Returns NULL if the user is not a member of that organization.
CREATE OR REPLACE FUNCTION buildos_get_org_role(p_org_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status  = 'active'
$$;

-- Returns the calling user's role within a given workspace.
-- Returns NULL if the user has no direct workspace membership.
-- NOTE: org owner/admin automatically get 'admin' here via policy logic —
--       they do NOT need a workspace_members row (enforced in policies below).
CREATE OR REPLACE FUNCTION buildos_get_ws_role(p_ws_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role
  FROM workspace_members
  WHERE workspace_id = p_ws_id
    AND user_id      = auth.uid()
    AND status       = 'active'
$$;

-- Returns the calling user's role within a given project.
-- Returns NULL if the user has no direct project membership.
CREATE OR REPLACE FUNCTION buildos_get_proj_role(p_proj_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role
  FROM project_members
  WHERE project_id = p_proj_id
    AND user_id    = auth.uid()
$$;

-- Returns all organization IDs where the calling user is an active member.
-- Replaces the old pattern of reading users.organization_id.
CREATE OR REPLACE FUNCTION buildos_current_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status  = 'active'
$$;

-- Returns the primary (first joined) org ID for the calling user.
-- Used where single-org context is needed.
CREATE OR REPLACE FUNCTION buildos_current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status  = 'active'
  ORDER BY created_at
  LIMIT 1
$$;

-- Returns workspace IDs the calling user can access.
-- RULE: access if:
--   (a) user has an active workspace_members row, OR
--   (b) user is org owner/admin (inherited access)
CREATE OR REPLACE FUNCTION buildos_current_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Direct workspace membership
  SELECT workspace_id
  FROM workspace_members
  WHERE user_id = auth.uid()
    AND status  = 'active'

  UNION

  -- Inherited access for org owner/admin
  SELECT w.id
  FROM workspaces w
  WHERE w.organization_id IN (SELECT buildos_current_org_ids())
    AND w.deleted_at IS NULL
    AND buildos_get_org_role(w.organization_id) IN ('owner', 'admin')
$$;

-- Returns project IDs the calling user can access.
-- RULE: access if:
--   (a) user has a project_members row, OR
--   (b) user is workspace admin or org owner/admin (inherited access)
CREATE OR REPLACE FUNCTION buildos_current_project_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Direct project membership
  SELECT project_id
  FROM project_members
  WHERE user_id = auth.uid()

  UNION

  -- Inherited access: workspace admin or org admin/owner
  SELECT p.id
  FROM projects p
  JOIN workspaces w ON w.id = p.workspace_id
  WHERE p.deleted_at IS NULL
    AND (
      buildos_get_ws_role(p.workspace_id)          = 'admin'
      OR buildos_get_org_role(w.organization_id)   IN ('owner', 'admin')
    )
$$;

-- Returns the calling user's effective role string for a given org.
-- For backwards-compat with old role checks (owner/admin/member/viewer).
CREATE OR REPLACE FUNCTION buildos_current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status  = 'active'
  ORDER BY
    CASE role
      WHEN 'owner'  THEN 1
      WHEN 'admin'  THEN 2
      WHEN 'member' THEN 3
      ELSE               4
    END
  LIMIT 1
$$;

-- ─── 2. Drop all existing policies on core tables ─────────────────────────────
-- Safe because RLS remains ENABLED — no policies = no access for anon/user role.
-- service_role bypasses RLS so migrations still work.

-- organizations
DROP POLICY IF EXISTS org_select_own        ON organizations;
DROP POLICY IF EXISTS org_insert_never      ON organizations;
DROP POLICY IF EXISTS org_update_owner_only ON organizations;
DROP POLICY IF EXISTS org_delete_never      ON organizations;

-- users
DROP POLICY IF EXISTS users_select_own_org        ON users;
DROP POLICY IF EXISTS users_insert_own_org        ON users;
DROP POLICY IF EXISTS users_update_self_or_admin  ON users;
DROP POLICY IF EXISTS users_delete_admin_only     ON users;

-- workspaces
DROP POLICY IF EXISTS ws_select_own_org ON workspaces;
DROP POLICY IF EXISTS ws_insert_admin   ON workspaces;
DROP POLICY IF EXISTS ws_update_admin   ON workspaces;
DROP POLICY IF EXISTS ws_delete_never   ON workspaces;

-- projects
DROP POLICY IF EXISTS proj_select_workspace ON projects;
DROP POLICY IF EXISTS proj_insert_admin     ON projects;
DROP POLICY IF EXISTS proj_update_admin     ON projects;
DROP POLICY IF EXISTS proj_delete_never     ON projects;

-- project_environments
DROP POLICY IF EXISTS env_select_member ON project_environments;
DROP POLICY IF EXISTS env_insert_admin  ON project_environments;
DROP POLICY IF EXISTS env_update_admin  ON project_environments;
DROP POLICY IF EXISTS env_delete_admin  ON project_environments;

-- project_settings
DROP POLICY IF EXISTS ps_select_member ON project_settings;
DROP POLICY IF EXISTS ps_insert_admin  ON project_settings;
DROP POLICY IF EXISTS ps_update_admin  ON project_settings;
DROP POLICY IF EXISTS ps_delete_admin  ON project_settings;

-- ─── 3. Recreate policies with membership-aware logic ─────────────────────────

-- organizations
-- Users see only organizations where they are active members.
CREATE POLICY org_select_member     ON organizations FOR SELECT
  USING (id IN (SELECT buildos_current_org_ids()));
CREATE POLICY org_insert_never      ON organizations FOR INSERT
  WITH CHECK (false);
CREATE POLICY org_update_owner_only ON organizations FOR UPDATE
  USING (buildos_get_org_role(id) = 'owner');
CREATE POLICY org_delete_never      ON organizations FOR DELETE
  USING (false);

-- users
-- Users see other users in their shared organizations only.
CREATE POLICY users_select_shared_org ON users FOR SELECT
  USING (organization_id IN (SELECT buildos_current_org_ids()));
CREATE POLICY users_insert_org_admin  ON users FOR INSERT
  WITH CHECK (organization_id IN (SELECT buildos_current_org_ids())
              AND buildos_get_org_role(organization_id) IN ('owner', 'admin'));
CREATE POLICY users_update_self_or_admin ON users FOR UPDATE
  USING (id = auth.uid()
         OR buildos_get_org_role(organization_id) IN ('owner', 'admin'));
CREATE POLICY users_delete_owner_only ON users FOR DELETE
  USING (buildos_get_org_role(organization_id) = 'owner' AND id <> auth.uid());

-- workspaces
-- Users see workspaces they are a member of (direct or inherited).
CREATE POLICY ws_select_member ON workspaces FOR SELECT
  USING (id IN (SELECT buildos_current_workspace_ids()) AND deleted_at IS NULL);
CREATE POLICY ws_insert_org_admin ON workspaces FOR INSERT
  WITH CHECK (organization_id IN (SELECT buildos_current_org_ids())
              AND buildos_get_org_role(organization_id) IN ('owner', 'admin'));
CREATE POLICY ws_update_ws_admin ON workspaces FOR UPDATE
  USING (id IN (SELECT buildos_current_workspace_ids())
         AND (buildos_get_ws_role(id) = 'admin'
              OR buildos_get_org_role(organization_id) IN ('owner', 'admin')));
CREATE POLICY ws_delete_never ON workspaces FOR DELETE
  USING (false);

-- projects
CREATE POLICY proj_select_member ON projects FOR SELECT
  USING (id IN (SELECT buildos_current_project_ids()) AND deleted_at IS NULL);
CREATE POLICY proj_insert_ws_admin ON projects FOR INSERT
  WITH CHECK (workspace_id IN (SELECT buildos_current_workspace_ids())
              AND (buildos_get_ws_role(workspace_id) = 'admin'
                   OR buildos_get_org_role(
                       (SELECT organization_id FROM workspaces WHERE id = workspace_id)
                     ) IN ('owner', 'admin')));
CREATE POLICY proj_update_proj_admin ON projects FOR UPDATE
  USING (id IN (SELECT buildos_current_project_ids())
         AND (buildos_get_proj_role(id)         IN ('admin')
              OR buildos_get_ws_role(workspace_id) = 'admin'
              OR buildos_get_org_role(
                  (SELECT organization_id FROM workspaces WHERE id = workspace_id)
                ) IN ('owner', 'admin')));
CREATE POLICY proj_delete_never ON projects FOR DELETE
  USING (false);

-- project_environments (inherits project access)
CREATE POLICY env_select_member ON project_environments FOR SELECT
  USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY env_insert_proj_admin ON project_environments FOR INSERT
  WITH CHECK (project_id IN (SELECT buildos_current_project_ids())
              AND buildos_get_proj_role(project_id) IN ('admin')
              OR buildos_get_org_role(buildos_current_org_id()) IN ('owner','admin'));
CREATE POLICY env_update_proj_admin ON project_environments FOR UPDATE
  USING (project_id IN (SELECT buildos_current_project_ids())
         AND (buildos_get_proj_role(project_id) = 'admin'
              OR buildos_get_org_role(buildos_current_org_id()) IN ('owner','admin')));
CREATE POLICY env_delete_proj_admin ON project_environments FOR DELETE
  USING (project_id IN (SELECT buildos_current_project_ids())
         AND buildos_get_proj_role(project_id) = 'admin');

-- project_settings (same as environments)
CREATE POLICY ps_select_member ON project_settings FOR SELECT
  USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY ps_insert_proj_admin ON project_settings FOR INSERT
  WITH CHECK (project_id IN (SELECT buildos_current_project_ids())
              AND (buildos_get_proj_role(project_id) = 'admin'
                   OR buildos_get_org_role(buildos_current_org_id()) IN ('owner','admin')));
CREATE POLICY ps_update_proj_admin ON project_settings FOR UPDATE
  USING (project_id IN (SELECT buildos_current_project_ids())
         AND (buildos_get_proj_role(project_id) = 'admin'
              OR buildos_get_org_role(buildos_current_org_id()) IN ('owner','admin')));
CREATE POLICY ps_delete_never ON project_settings FOR DELETE
  USING (false);

-- ─── 4. RLS policies for membership tables themselves ─────────────────────────

-- organization_members
-- Members can see their own memberships + other members of shared orgs.
-- Only org owner/admin can insert/update/delete.
CREATE POLICY om_select_shared_org ON organization_members FOR SELECT
  USING (organization_id IN (SELECT buildos_current_org_ids()));
CREATE POLICY om_insert_org_admin ON organization_members FOR INSERT
  WITH CHECK (organization_id IN (SELECT buildos_current_org_ids())
              AND buildos_get_org_role(organization_id) IN ('owner', 'admin'));
CREATE POLICY om_update_org_admin ON organization_members FOR UPDATE
  USING (organization_id IN (SELECT buildos_current_org_ids())
         AND buildos_get_org_role(organization_id) IN ('owner', 'admin'));
CREATE POLICY om_delete_org_admin ON organization_members FOR DELETE
  USING (organization_id IN (SELECT buildos_current_org_ids())
         AND buildos_get_org_role(organization_id) IN ('owner', 'admin')
         AND user_id <> auth.uid());  -- cannot remove yourself

-- workspace_members
CREATE POLICY wm_select_ws_access ON workspace_members FOR SELECT
  USING (workspace_id IN (SELECT buildos_current_workspace_ids()));
CREATE POLICY wm_insert_ws_admin ON workspace_members FOR INSERT
  WITH CHECK (workspace_id IN (SELECT buildos_current_workspace_ids())
              AND (buildos_get_ws_role(workspace_id) = 'admin'
                   OR buildos_get_org_role(
                       (SELECT organization_id FROM workspaces WHERE id = workspace_id)
                     ) IN ('owner','admin')));
CREATE POLICY wm_update_ws_admin ON workspace_members FOR UPDATE
  USING (workspace_id IN (SELECT buildos_current_workspace_ids())
         AND (buildos_get_ws_role(workspace_id) = 'admin'
              OR buildos_get_org_role(
                  (SELECT organization_id FROM workspaces WHERE id = workspace_id)
                ) IN ('owner','admin')));
CREATE POLICY wm_delete_ws_admin ON workspace_members FOR DELETE
  USING (workspace_id IN (SELECT buildos_current_workspace_ids())
         AND (buildos_get_ws_role(workspace_id) = 'admin'
              OR buildos_get_org_role(
                  (SELECT organization_id FROM workspaces WHERE id = workspace_id)
                ) IN ('owner','admin'))
         AND user_id <> auth.uid());

-- project_members
CREATE POLICY pm_select_proj_access ON project_members FOR SELECT
  USING (project_id IN (SELECT buildos_current_project_ids()));
CREATE POLICY pm_insert_proj_admin ON project_members FOR INSERT
  WITH CHECK (project_id IN (SELECT buildos_current_project_ids())
              AND (buildos_get_proj_role(project_id) = 'admin'
                   OR buildos_get_ws_role(
                       (SELECT workspace_id FROM projects WHERE id = project_id)
                     ) = 'admin'
                   OR buildos_get_org_role(buildos_current_org_id()) IN ('owner','admin')));
CREATE POLICY pm_update_proj_admin ON project_members FOR UPDATE
  USING (project_id IN (SELECT buildos_current_project_ids())
         AND (buildos_get_proj_role(project_id) = 'admin'
              OR buildos_get_org_role(buildos_current_org_id()) IN ('owner','admin')));
CREATE POLICY pm_delete_proj_admin ON project_members FOR DELETE
  USING (project_id IN (SELECT buildos_current_project_ids())
         AND (buildos_get_proj_role(project_id) = 'admin'
              OR buildos_get_org_role(buildos_current_org_id()) IN ('owner','admin'))
         AND user_id <> auth.uid());

COMMIT;

-- ─── SMOKE TESTS (run after applying as a different role) ────────────────────
-- As authenticated user (not service_role):
--   SELECT buildos_current_org_id();                    -- returns your org UUID
--   SELECT count(*) FROM organization_members;           -- returns rows for your orgs only
--   SELECT count(*) FROM workspaces;                     -- returns your workspaces only
--   SELECT count(*) FROM projects;                       -- returns your projects only
--
-- As a NEW user with no memberships:
--   SELECT count(*) FROM organizations;                  -- must return 0
--   SELECT count(*) FROM workspaces;                     -- must return 0
--   SELECT count(*) FROM projects;                       -- must return 0
--
-- As service_role:
--   SELECT count(*) FROM organizations;                  -- returns all (expected — bypasses RLS)
