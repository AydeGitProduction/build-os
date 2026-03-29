-- ============================================================
-- BUILD OS — Migration 001: Workspace & Projects
-- ============================================================
-- Naming:  YYYYMMDDHHMMSS_description.sql
-- Date:    2026-03-28
-- Author:  Build OS Bootstrap
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Auto-update trigger function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION buildos_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── organizations ────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  name            text          NOT NULL,
  slug            text          NOT NULL,
  plan            text          NOT NULL DEFAULT 'free',
  billing_email   text,
  metadata        jsonb         NOT NULL DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,

  CONSTRAINT organizations_pkey          PRIMARY KEY (id),
  CONSTRAINT organizations_slug_unique   UNIQUE (slug),
  CONSTRAINT organizations_plan_check    CHECK (plan IN ('free', 'pro', 'enterprise'))
);

CREATE INDEX idx_organizations_slug ON organizations (slug) WHERE deleted_at IS NULL;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              uuid          NOT NULL,
  organization_id uuid          NOT NULL,
  email           text          NOT NULL,
  full_name       text,
  avatar_url      text,
  role            text          NOT NULL DEFAULT 'member',
  is_active       boolean       NOT NULL DEFAULT true,
  last_seen_at    timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT users_pkey               PRIMARY KEY (id),
  CONSTRAINT users_email_unique       UNIQUE (email),
  CONSTRAINT users_auth_fk            FOREIGN KEY (id)              REFERENCES auth.users(id)      ON DELETE CASCADE,
  CONSTRAINT users_org_fk             FOREIGN KEY (organization_id) REFERENCES organizations(id)   ON DELETE CASCADE,
  CONSTRAINT users_role_check         CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE INDEX idx_users_organization_id ON users (organization_id);
CREATE INDEX idx_users_email           ON users (email);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ─── workspaces ───────────────────────────────────────────────────────────────
CREATE TABLE workspaces (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL,
  name            text          NOT NULL,
  slug            text          NOT NULL,
  description     text,
  is_default      boolean       NOT NULL DEFAULT false,
  created_by      uuid          NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,

  CONSTRAINT workspaces_pkey          PRIMARY KEY (id),
  CONSTRAINT workspaces_slug_org_uq   UNIQUE (organization_id, slug),
  CONSTRAINT workspaces_org_fk        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT workspaces_creator_fk    FOREIGN KEY (created_by)      REFERENCES users(id)         ON DELETE RESTRICT
);

CREATE INDEX idx_workspaces_org_id ON workspaces (organization_id) WHERE deleted_at IS NULL;

CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- ─── projects ─────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id                          uuid              NOT NULL DEFAULT gen_random_uuid(),
  workspace_id                uuid              NOT NULL,
  name                        text              NOT NULL,
  slug                        text              NOT NULL,
  description                 text,
  status                      text              NOT NULL DEFAULT 'draft',
  tech_stack                  jsonb             NOT NULL DEFAULT '[]',
  complexity_score            integer,
  estimated_build_cost_usd    numeric(10,4),
  actual_build_cost_usd       numeric(10,4)     NOT NULL DEFAULT 0,
  budget_usd                  numeric(10,4),
  created_by                  uuid              NOT NULL,
  created_at                  timestamptz       NOT NULL DEFAULT now(),
  updated_at                  timestamptz       NOT NULL DEFAULT now(),
  deleted_at                  timestamptz,

  CONSTRAINT projects_pkey              PRIMARY KEY (id),
  CONSTRAINT projects_slug_ws_uq        UNIQUE (workspace_id, slug),
  CONSTRAINT projects_workspace_fk      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT projects_creator_fk        FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE RESTRICT,
  CONSTRAINT projects_status_check      CHECK (status IN ('draft','blueprint','planning','in_progress','in_qa','ready_for_release','live','paused','archived')),
  CONSTRAINT projects_complexity_check  CHECK (complexity_score BETWEEN 1 AND 10)
);

CREATE INDEX idx_projects_workspace_id ON projects (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status       ON projects (status)       WHERE deleted_at IS NULL;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ─── project_environments ────────────────────────────────────────────────────
CREATE TABLE project_environments (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid          NOT NULL,
  name            text          NOT NULL,
  is_production   boolean       NOT NULL DEFAULT false,
  variables       jsonb         NOT NULL DEFAULT '{}',
  deployment_url  text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT project_environments_pkey        PRIMARY KEY (id),
  CONSTRAINT project_environments_name_uq     UNIQUE (project_id, name),
  CONSTRAINT project_environments_project_fk  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_environments_name_check  CHECK (name IN ('development', 'staging', 'production'))
);

CREATE INDEX idx_project_environments_project_id ON project_environments (project_id);

CREATE TRIGGER project_environments_updated_at
  BEFORE UPDATE ON project_environments
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE project_environments ENABLE ROW LEVEL SECURITY;

-- ─── project_settings ────────────────────────────────────────────────────────
CREATE TABLE project_settings (
  id                          uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_id                  uuid          NOT NULL,
  max_parallel_agents         integer       NOT NULL DEFAULT 3,
  auto_dispatch               boolean       NOT NULL DEFAULT true,
  require_qa_on_all_tasks     boolean       NOT NULL DEFAULT true,
  cost_alert_threshold_usd    numeric(10,4),
  preferred_ai_provider       text,
  notification_webhook_url    text,
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT project_settings_pkey            PRIMARY KEY (id),
  CONSTRAINT project_settings_project_uq      UNIQUE (project_id),
  CONSTRAINT project_settings_project_fk      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_settings_provider_check  CHECK (preferred_ai_provider IN ('anthropic', 'openai') OR preferred_ai_provider IS NULL),
  CONSTRAINT project_settings_agents_check    CHECK (max_parallel_agents BETWEEN 1 AND 20)
);

CREATE TRIGGER project_settings_updated_at
  BEFORE UPDATE ON project_settings
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE project_settings ENABLE ROW LEVEL SECURITY;
