-- ============================================================
-- BUILD OS — Migration 031: RBAC Membership Tables
-- Epic: U1-A — Users / Roles / Permissions Foundation
-- ============================================================
-- WHAT THIS DOES:
--   Creates the three membership junction tables required for
--   per-object RBAC: organization_members, workspace_members,
--   project_members.
--
-- PREREQUISITE: Migrations 001–030 applied.
--
-- APPLY ORDER:
--   1. Apply this file (schema + seed)
--   2. Apply migration 032 (RLS helper function overhaul)
--   3. Apply migration 033 (RLS policy overhaul)
--
-- DEVELOPER NOTES:
--   - Do NOT drop users.organization_id or users.role yet.
--     Migration 033 will handle the deprecation after RLS is safe.
--   - Seed step at bottom migrates existing data. Run ONCE.
--   - All tables have RLS enabled but NO policies yet.
--     Policies are added in migration 033.
-- ============================================================

-- ─── organization_members ────────────────────────────────────────────────────
-- One row per user per organization.
-- role: owner > admin > member > viewer
-- status: active | invited | suspended

CREATE TABLE organization_members (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  user_id         uuid        NOT NULL,
  role            text        NOT NULL DEFAULT 'member',
  status          text        NOT NULL DEFAULT 'active',
  invited_by      uuid,                         -- NULL for founder / seeded rows
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_members_pkey       PRIMARY KEY (id),
  CONSTRAINT org_members_uq         UNIQUE (organization_id, user_id),
  CONSTRAINT org_members_org_fk     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_members_user_fk    FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE,
  CONSTRAINT org_members_inviter_fk FOREIGN KEY (invited_by)      REFERENCES users(id)         ON DELETE SET NULL,
  CONSTRAINT org_members_role_check CHECK (role   IN ('owner', 'admin', 'member', 'viewer')),
  CONSTRAINT org_members_status_check CHECK (status IN ('active', 'invited', 'suspended'))
);

CREATE INDEX idx_org_members_org_id  ON organization_members (organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members (user_id);
CREATE INDEX idx_org_members_role    ON organization_members (organization_id, role);

CREATE TRIGGER org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- ─── workspace_members ───────────────────────────────────────────────────────
-- One row per user per workspace.
-- role: admin | editor | viewer
-- status: active | invited | suspended
-- NOTE: Workspace admin ≠ org admin. Workspace role is scoped to the workspace only.

CREATE TABLE workspace_members (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL,
  user_id      uuid        NOT NULL,
  role         text        NOT NULL DEFAULT 'viewer',
  status       text        NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ws_members_pkey         PRIMARY KEY (id),
  CONSTRAINT ws_members_uq           UNIQUE (workspace_id, user_id),
  CONSTRAINT ws_members_ws_fk        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT ws_members_user_fk      FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT ws_members_role_check   CHECK (role   IN ('admin', 'editor', 'viewer')),
  CONSTRAINT ws_members_status_check CHECK (status IN ('active', 'invited', 'suspended'))
);

CREATE INDEX idx_ws_members_ws_id   ON workspace_members (workspace_id);
CREATE INDEX idx_ws_members_user_id ON workspace_members (user_id);

CREATE TRIGGER ws_members_updated_at
  BEFORE UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- ─── project_members ─────────────────────────────────────────────────────────
-- One row per user per project.
-- role: admin | editor | viewer
-- No status — project membership is binary (present or absent).
-- Invitation flow handled by workspace_members invite mechanism.

CREATE TABLE project_members (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL,
  user_id    uuid        NOT NULL,
  role       text        NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT proj_members_pkey       PRIMARY KEY (id),
  CONSTRAINT proj_members_uq         UNIQUE (project_id, user_id),
  CONSTRAINT proj_members_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT proj_members_user_fk    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT proj_members_role_check CHECK (role IN ('admin', 'editor', 'viewer'))
);

CREATE INDEX idx_proj_members_project_id ON project_members (project_id);
CREATE INDEX idx_proj_members_user_id    ON project_members (user_id);

CREATE TRIGGER proj_members_updated_at
  BEFORE UPDATE ON project_members
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- ─── SEED: Migrate existing users into membership tables ─────────────────────
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
--
-- Logic:
--   users.role = 'owner'  → organization_members.role = 'owner'
--   users.role = 'admin'  → organization_members.role = 'admin'
--   users.role = 'member' → organization_members.role = 'member'
--
-- Every existing user becomes:
--   - admin on every workspace in their org (they were previously unrestricted)
--   - admin on every project in those workspaces (same reason)
-- After migration 033 (new RLS), access will be controlled by these rows only.

INSERT INTO organization_members (organization_id, user_id, role, status)
SELECT
  u.organization_id,
  u.id,
  CASE u.role
    WHEN 'owner'  THEN 'owner'
    WHEN 'admin'  THEN 'admin'
    ELSE               'member'
  END,
  'active'
FROM users u
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role, status)
SELECT
  w.id,
  u.id,
  'admin',
  'active'
FROM workspaces w
JOIN users u ON u.organization_id = w.organization_id
WHERE w.deleted_at IS NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO project_members (project_id, user_id, role)
SELECT
  p.id,
  u.id,
  'admin'
FROM projects p
JOIN workspaces w ON w.id = p.workspace_id
JOIN users u      ON u.organization_id = w.organization_id
WHERE p.deleted_at IS NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

-- ─── VERIFY (run these after applying) ───────────────────────────────────────
-- SELECT count(*) FROM organization_members;   -- should equal count of users
-- SELECT count(*) FROM workspace_members;      -- should equal users × workspaces
-- SELECT count(*) FROM project_members;        -- should equal users × projects
