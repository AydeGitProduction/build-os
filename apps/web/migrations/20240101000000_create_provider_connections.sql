-- migrations/20240101000000_create_provider_connections.sql

CREATE TABLE IF NOT EXISTS provider_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  access_token_ref TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One connection per provider per workspace
  CONSTRAINT provider_connections_workspace_provider_unique
    UNIQUE (workspace_id, provider)
);

-- Index for lookups by workspace
CREATE INDEX IF NOT EXISTS idx_provider_connections_workspace_id
  ON provider_connections (workspace_id);

-- Index for lookups by user
CREATE INDEX IF NOT EXISTS idx_provider_connections_user_id
  ON provider_connections (user_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_provider_connections_updated_at
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see connections in their own workspaces
CREATE POLICY "provider_connections_select_own_workspace"
  ON provider_connections FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert connections into their own workspaces
CREATE POLICY "provider_connections_insert_own_workspace"
  ON provider_connections FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can update connections in their own workspaces
CREATE POLICY "provider_connections_update_own_workspace"
  ON provider_connections FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );