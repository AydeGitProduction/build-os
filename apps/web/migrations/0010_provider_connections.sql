-- migrations/0010_provider_connections.sql
-- Creates the provider_connections table if not already present.

CREATE TABLE IF NOT EXISTS public.provider_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('supabase', 'github', 'linear', 'slack', 'notion')),
  access_token_ref TEXT NOT NULL,          -- service role key (or oauth token)
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One connection per workspace per provider
  CONSTRAINT provider_connections_workspace_provider_key
    UNIQUE (workspace_id, provider)
);

-- Index for fast lookup by workspace
CREATE INDEX IF NOT EXISTS idx_provider_connections_workspace_id
  ON public.provider_connections (workspace_id);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_provider_connections_user_id
  ON public.provider_connections (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_connections_updated_at ON public.provider_connections;
CREATE TRIGGER trg_provider_connections_updated_at
  BEFORE UPDATE ON public.provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;

-- Users can see connections for their workspaces only (via workspace_members)
CREATE POLICY "workspace_members_can_read_connections"
  ON public.provider_connections
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Only the service role (used server-side) can insert/update/delete
CREATE POLICY "service_role_full_access"
  ON public.provider_connections
  FOR ALL
  USING (auth.role() = 'service_role');