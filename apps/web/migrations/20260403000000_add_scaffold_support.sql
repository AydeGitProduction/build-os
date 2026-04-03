-- migrations/20260403000000_add_scaffold_support.sql
--
-- Adds scaffold_committed_at column to projects table.
-- Tracks whether the platform scaffold has been committed to GitHub.
-- Used for idempotency by POST /api/projects/[id]/scaffold.
--
-- Also ensures project_type column exists (should already from projects/new).

-- Add scaffold_committed_at if not present
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS scaffold_committed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN projects.scaffold_committed_at IS
  'Timestamp of when the platform scaffold (Sidebar, dashboard, etc.) was committed to GitHub. NULL means not yet scaffolded.';

-- Ensure project_type column exists with expected values
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'saas';

COMMENT ON COLUMN projects.project_type IS
  'Platform type selected during wizard. Values: saas | ai_newsletter | crm | marketplace | ai_app | tool | api | other. Controls which platform context is injected into agent prompts.';

-- Optional: add a CHECK constraint for valid project types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_project_type_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_project_type_check
      CHECK (project_type IN ('saas', 'ai_newsletter', 'crm', 'marketplace', 'ai_app', 'tool', 'api', 'other'));
  END IF;
END $$;

-- Index for fast lookup by project_type (useful for analytics)
CREATE INDEX IF NOT EXISTS idx_projects_project_type ON projects(project_type);
