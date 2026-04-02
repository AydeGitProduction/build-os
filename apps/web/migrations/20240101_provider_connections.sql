-- migrations/20240101_provider_connections.sql
-- Stores per-admin and per-project provider OAuth connections

CREATE TABLE IF NOT EXISTS provider_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = admin-level default
  provider          TEXT NOT NULL,  -- 'github', 'vercel', 'stripe', etc.
  mode              TEXT NOT NULL CHECK (mode IN ('user_managed', 'platform_managed')),
  access_token_ref  TEXT,           -- encrypted token or vault reference
  active            BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provider_connections_project_provider
  ON provider_connections(project_id, provider)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_provider_connections_admin_provider
  ON provider_connections(admin_id, provider)
  WHERE active = true AND project_id IS NULL;

-- Unique: one active connection per (project, provider)
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_connections_unique_project_provider
  ON provider_connections(project_id, provider)
  WHERE active = true AND project_id IS NOT NULL;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER provider_connections_updated_at
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

-- Admins can only see their own connections
CREATE POLICY provider_connections_admin_select
  ON provider_connections FOR SELECT
  USING (admin_id = auth.uid());

CREATE POLICY provider_connections_admin_insert
  ON provider_connections FOR INSERT
  WITH CHECK (admin_id = auth.uid());

CREATE POLICY provider_connections_admin_update
  ON provider_connections FOR UPDATE
  USING (admin_id = auth.uid());

-- Service role bypass (used by resolveProviderOwnership)
CREATE POLICY provider_connections_service_role
  ON provider_connections FOR ALL
  TO service_role
  USING (true);

COMMENT ON TABLE provider_connections IS
  'Stores per-admin and per-project OAuth connections for external providers. '
  'project_id NULL = admin-level default, non-null = project-specific override. '
  'mode=user_managed means access_token_ref is used; platform_managed falls through to env vars.';