-- migrations/0042_provider_connections.sql

-- Provider connections table (stores user_managed OAuth tokens)
CREATE TABLE IF NOT EXISTS provider_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,                          -- 'vercel', 'github', etc.
  mode            TEXT NOT NULL CHECK (mode IN ('user_managed', 'platform_managed')),
  encrypted_token TEXT,                                   -- AES-256-GCM encrypted, null for platform_managed
  metadata        JSONB NOT NULL DEFAULT '{}',            -- team_id, team_slug, scopes, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_connections_project_provider
  ON provider_connections (project_id, provider);

-- Track Vercel info on projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vercel_project_id      TEXT,
  ADD COLUMN IF NOT EXISTS vercel_project_name    TEXT,
  ADD COLUMN IF NOT EXISTS vercel_team_id         TEXT,
  ADD COLUMN IF NOT EXISTS vercel_ownership_mode  TEXT CHECK (vercel_ownership_mode IN ('user_managed', 'platform_managed'));

-- RLS: only service role can read encrypted tokens
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON provider_connections
  USING (auth.role() = 'service_role');