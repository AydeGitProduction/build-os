-- migrations/0042_add_provider_connections.sql

-- Provider connections table for user-managed OAuth credentials.
-- Supports per-project and per-user scoping (WS4-1).

CREATE TABLE IF NOT EXISTS provider_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,   -- NULL = user-scoped
  provider      VARCHAR(64) NOT NULL,                              -- 'github', 'gitlab', etc.
  access_token_ref  TEXT NOT NULL,                                 -- vault: / env: / raw
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid      BOOLEAN NOT NULL DEFAULT TRUE,
  metadata      JSONB NOT NULL DEFAULT '{}'
);

-- Efficient lookups for ownership resolution
CREATE INDEX IF NOT EXISTS idx_pc_user_project_provider
  ON provider_connections (user_id, project_id, provider)
  WHERE is_valid = TRUE;

CREATE INDEX IF NOT EXISTS idx_pc_user_provider_null_project
  ON provider_connections (user_id, provider)
  WHERE project_id IS NULL AND is_valid = TRUE;

-- Prevent duplicate active connections per scope
CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_user_project_provider
  ON provider_connections (user_id, project_id, provider)
  WHERE is_valid = TRUE AND project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_user_provider_global
  ON provider_connections (user_id, provider)
  WHERE is_valid = TRUE AND project_id IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_provider_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pc_updated_at
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_connections_updated_at();