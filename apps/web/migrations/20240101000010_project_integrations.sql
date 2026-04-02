-- migrations/20240101000010_project_integrations.sql
-- Ensures the project_integrations table exists with the required schema.

CREATE TABLE IF NOT EXISTS public.project_integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('github', 'vercel', 'supabase')),
  status                TEXT NOT NULL DEFAULT 'disconnected'
                          CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
  mode                  TEXT NOT NULL DEFAULT 'user_managed'
                          CHECK (mode IN ('user_managed', 'platform_managed')),
  environment           TEXT,
  last_health_check     TIMESTAMPTZ,
  credentials_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, provider)
);

-- One integration record per project per provider
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_integrations_project_provider
  ON public.project_integrations (project_id, provider);

-- Index for fast per-project lookups
CREATE INDEX IF NOT EXISTS idx_project_integrations_project_id
  ON public.project_integrations (project_id);

-- RLS
ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;

-- Users can only read their own project integrations
CREATE POLICY "project_integrations_select_own"
  ON public.project_integrations
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Users can only modify their own project integrations
CREATE POLICY "project_integrations_modify_own"
  ON public.project_integrations
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_project_integrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_integrations_updated_at
  BEFORE UPDATE ON public.project_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_integrations_updated_at();