-- migrations/20240101000000_project_integrations.sql

CREATE TABLE IF NOT EXISTS project_integrations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider                    TEXT NOT NULL CHECK (provider IN ('github', 'vercel', 'supabase')),
  mode                        TEXT NOT NULL DEFAULT 'user_managed'
                                CHECK (mode IN ('user_managed', 'platform_managed')),
  connected                   BOOLEAN NOT NULL DEFAULT false,
  status                      TEXT NOT NULL DEFAULT 'disconnected'
                                CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),

  -- External identity
  external_id                 TEXT,           -- e.g. Vercel project ID, Supabase project ref
  external_username           TEXT,           -- e.g. GitHub username
  external_metadata           JSONB,          -- arbitrary provider-specific data

  -- Credentials (encrypted at rest)
  access_token_encrypted      TEXT,
  installation_id             BIGINT,         -- GitHub App installation ID

  -- Health check telemetry
  last_health_check_at        TIMESTAMPTZ,
  last_health_check_latency_ms INT,
  last_health_check_error     TEXT,

  -- Misc
  environment                 TEXT DEFAULT 'production',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, provider)
);

-- RLS
ALTER TABLE project_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_integrations_select"
  ON project_integrations FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      SELECT p.id FROM projects p
        JOIN team_members tm ON tm.team_id = p.team_id
        WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "project_integrations_update"
  ON project_integrations FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      SELECT p.id FROM projects p
        JOIN team_members tm ON tm.team_id = p.team_id
        WHERE tm.user_id = auth.uid()
    )
  );