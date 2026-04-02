-- migrations/20240402_create_project_integrations.sql
-- Assumes provider_connections and projects tables already exist.

-- ---------------------------------------------------------------------------
-- Table: project_integrations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_integrations (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID          NOT NULL REFERENCES public.projects(id)          ON DELETE CASCADE,
  provider_connection_id UUID         NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  environment           TEXT          NOT NULL CHECK (environment IN ('production', 'staging', 'development')),
  status                TEXT          NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- One connection per environment per project
  CONSTRAINT uq_project_integration UNIQUE (project_id, provider_connection_id, environment)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_pi_project_id
  ON public.project_integrations (project_id);

CREATE INDEX IF NOT EXISTS idx_pi_connection_id
  ON public.project_integrations (provider_connection_id);

CREATE INDEX IF NOT EXISTS idx_pi_project_env
  ON public.project_integrations (project_id, environment);

-- RLS
ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;

-- Workspace members can read integrations for their projects
CREATE POLICY "workspace_members_read_integrations"
  ON public.project_integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_integrations.project_id
        AND wm.user_id = auth.uid()
    )
  );

-- Only owners/admins can insert or update integrations (enforced in app layer,
-- but RLS provides defence-in-depth)
CREATE POLICY "workspace_admins_write_integrations"
  ON public.project_integrations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_integrations.project_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Ensure provider_connections has a status column (if not already present)
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_connections
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'error', 'pending'));