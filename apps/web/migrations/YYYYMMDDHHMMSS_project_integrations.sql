-- migrations/YYYYMMDDHHMMSS_project_integrations.sql

-- Ensure provider_connections table has workspace_id + provider columns
-- (Likely already exists; shown here for completeness)
-- CREATE TABLE IF NOT EXISTS provider_connections (
--   id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
--   provider       TEXT NOT NULL,          -- e.g. 'github', 'vercel', 'aws'
--   status         TEXT NOT NULL DEFAULT 'active',
--   created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
--   updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
-- );

CREATE TABLE IF NOT EXISTS project_integrations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID        NOT NULL REFERENCES projects(id)             ON DELETE CASCADE,
  provider_connection_id  UUID        NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  environment             TEXT        NOT NULL CHECK (environment IN ('production','staging','development')),
  status                  TEXT        NOT NULL DEFAULT 'active',
  created_by              UUID        REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each (project, connection, environment) combo is unique
  CONSTRAINT uq_project_connection_env
    UNIQUE (project_id, provider_connection_id, environment)
);

-- Index for fast lookup by project
CREATE INDEX IF NOT EXISTS idx_project_integrations_project_id
  ON project_integrations (project_id);

-- RLS
ALTER TABLE project_integrations ENABLE ROW LEVEL SECURITY;

-- Members of the workspace that owns the project may read integrations
CREATE POLICY "workspace members can read project integrations"
  ON project_integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM projects p
        JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
       WHERE p.id  = project_integrations.project_id
         AND wm.user_id = auth.uid()
    )
  );

-- Members of the workspace may insert/update integrations
CREATE POLICY "workspace members can upsert project integrations"
  ON project_integrations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM projects p
        JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
       WHERE p.id  = project_integrations.project_id
         AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace members can update project integrations"
  ON project_integrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM projects p
        JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
       WHERE p.id  = project_integrations.project_id
         AND wm.user_id = auth.uid()
    )
  );