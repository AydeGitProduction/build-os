-- migrations/20260330000059_p11_project_provisioning_status.sql

-- Add provisioning_status column to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (provisioning_status IN ('pending', 'provisioning', 'provisioned', 'failed', 'timed_out'));

-- Add provisioning_metadata JSONB for per-step tracking
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS provisioning_metadata JSONB DEFAULT '{}'::jsonb;

-- Add provisioning timestamps
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS provisioning_started_at TIMESTAMPTZ;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS provisioning_completed_at TIMESTAMPTZ;

-- Index for querying failed/pending provisioning (for admin dashboards, retry jobs)
CREATE INDEX IF NOT EXISTS idx_projects_provisioning_status
  ON projects(provisioning_status)
  WHERE provisioning_status IN ('pending', 'provisioning', 'failed', 'timed_out');

-- Ensure deployment_targets has necessary columns
ALTER TABLE deployment_targets
ADD COLUMN IF NOT EXISTS github_repo_url TEXT;

ALTER TABLE deployment_targets
ADD COLUMN IF NOT EXISTS github_repo_full_name TEXT;

ALTER TABLE deployment_targets
ADD COLUMN IF NOT EXISTS vercel_project_id TEXT;

ALTER TABLE deployment_targets
ADD COLUMN IF NOT EXISTS vercel_project_url TEXT;

ALTER TABLE deployment_targets
ADD COLUMN IF NOT EXISTS vercel_team_id TEXT;

ALTER TABLE deployment_targets
ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

-- Ensure project_integrations table exists with required structure
CREATE TABLE IF NOT EXISTS project_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'vercel', 'slack', 'linear', 'custom')),
  external_id TEXT NOT NULL,
  external_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_project_integrations_project_id
  ON project_integrations(project_id);

CREATE INDEX IF NOT EXISTS idx_project_integrations_provider
  ON project_integrations(provider);

-- Trigger to auto-update updated_at on project_integrations
CREATE OR REPLACE FUNCTION update_project_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_integrations_updated_at ON project_integrations;
CREATE TRIGGER trigger_project_integrations_updated_at
  BEFORE UPDATE ON project_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_project_integrations_updated_at();

-- Comment documenting the provisioning flow
COMMENT ON COLUMN projects.provisioning_status IS
  'Tracks infrastructure provisioning state: pending (created, not started) | provisioning (in progress) | provisioned (complete) | failed (error, retryable) | timed_out (exceeded timeout, retryable)';

COMMENT ON COLUMN projects.provisioning_metadata IS
  'Per-step provisioning details: { github: { status, repoUrl, repoFullName, error }, vercel: { status, projectId, projectUrl, error }, steps: [...] }';