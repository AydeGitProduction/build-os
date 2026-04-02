-- migrations/YYYYMMDDHHMMSS_create_project_integrations.sql
-- Run this migration before deploying WS3-1.

-- ============================================================================
-- project_integrations
-- Stores the relationship between a project and a workspace provider_connection
-- for a specific deployment environment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_connection_id UUID NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  environment           TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint — one connection per project per environment
-- (upsert conflict target)
CREATE UNIQUE INDEX IF NOT EXISTS project_integrations_uq
  ON project_integrations (project_id, provider_connection_id, environment);

-- Index for looking up all integrations for a project
CREATE INDEX IF NOT EXISTS project_integrations_project_idx
  ON project_integrations (project_id);

-- Index for looking up all projects using a connection
CREATE INDEX IF NOT EXISTS project_integrations_connection_idx
  ON project_integrations (provider_connection_id);

-- ============================================================================
-- Row-level security
-- ============================================================================

ALTER TABLE project_integrations ENABLE ROW LEVEL SECURITY;

-- Only workspace members may view/modify integrations for their workspace's projects
CREATE POLICY "workspace_member_access" ON project_integrations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_integrations.project_id
        AND wm.user_id = auth.uid()
    )
  );