-- migrations/20240402_provider_connections.sql

-- Provider connections table to support ownership resolution
CREATE TABLE IF NOT EXISTS provider_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket')),
  ownership_mode        TEXT NOT NULL DEFAULT 'platform_managed'
                          CHECK (ownership_mode IN ('user_managed', 'platform_managed')),
  -- Encrypted token reference (stored in vault or as encrypted value)
  access_token_ref      TEXT,
  -- Provider account info
  provider_account_id   TEXT,
  provider_account_login TEXT,
  scopes                TEXT[],
  -- State
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at            TIMESTAMPTZ,
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active connection per admin+project+provider
  UNIQUE (admin_id, project_id, provider, is_active)
    DEFERRABLE INITIALLY DEFERRED
);

-- Index for ownership resolution queries
CREATE INDEX IF NOT EXISTS idx_provider_connections_lookup
  ON provider_connections (admin_id, project_id, provider, is_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_provider_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_provider_connections_updated_at
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW EXECUTE FUNCTION update_provider_connections_updated_at();

-- RLS: Users can only see their own connections
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_connections_owner_policy
  ON provider_connections
  FOR ALL
  USING (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());

-- Service role bypass
CREATE POLICY provider_connections_service_policy
  ON provider_connections
  FOR ALL
  TO service_role
  USING (TRUE);