-- migrations/20240115_user_integrations.sql
--
-- Creates the user_integrations table for storing OAuth credentials.
-- SECURITY: access_token column uses encryption at rest (Supabase Vault
-- or column-level encryption should be applied in production).
--
-- WS3-3: Required for resolveProviderOwnership credential lookup

CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'vercel')),
  access_token TEXT NOT NULL,       -- SECURITY: encrypt at rest
  metadata JSONB DEFAULT '{}',       -- {installation_id?, team_id?, scope?}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One integration per provider per user
  UNIQUE (user_id, provider)
);

-- RLS: Users can only see their own integrations
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_integrations" ON user_integrations
  FOR ALL
  USING (auth.uid() = user_id);

-- Admin bypass for server-side credential resolution
-- (The admin client used in resolveProviderOwnership bypasses RLS)

-- Index for fast lookup by user + provider
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_provider
  ON user_integrations (user_id, provider);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();