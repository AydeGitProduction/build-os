-- migrations/20240402_project_integrations.sql
-- Creates the project_integrations table required by this route.

CREATE TABLE IF NOT EXISTS project_integrations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider                    TEXT NOT NULL CHECK (provider IN ('github', 'vercel', 'supabase')),

  -- Connection state
  is_connected                BOOLEAN NOT NULL DEFAULT FALSE,
  ownership_mode              TEXT NOT NULL DEFAULT 'platform_managed'
                                CHECK (ownership_mode IN ('user_managed', 'platform_managed')),

  -- Context
  environment                 TEXT,           -- e.g. 'production', 'preview', 'development'
  configured_at               TIMESTAMPTZ,

  -- Health tracking
  last_health_check_at        TIMESTAMPTZ,
  last_health_check_success   BOOLEAN,
  last_health_check_latency_ms INTEGER,
  last_health_check_error     TEXT,

  -- Provider-specific data (flexible)
  -- GitHub:  { username, repository_url, repository_name, installation_id, permissions[] }
  -- Vercel:  { team_id, team_slug, vercel_project_id, deployment_url, framework }
  -- Supabase:{ project_ref, project_name, region, database_version }
  -- Shared:  { oauth_token_ref, user_connected, platform_seeded, installation_source }
  metadata                    JSONB DEFAULT '{}',

  -- Uniqueness: one row per project+provider
  UNIQUE (project_id, provider),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the primary query pattern: project_id + provider IN (...)
CREATE INDEX IF NOT EXISTS idx_project_integrations_project_id
  ON project_integrations (project_id);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_integrations_updated_at
  BEFORE UPDATE ON project_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE project_integrations ENABLE ROW LEVEL SECURITY;

-- Policy: users can read integrations for projects they own or are members of
CREATE POLICY "project_integrations_select"
  ON project_integrations
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      SELECT p.id FROM projects p
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Policy: only project owners can modify integrations
CREATE POLICY "project_integrations_modify"
  ON project_integrations
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );