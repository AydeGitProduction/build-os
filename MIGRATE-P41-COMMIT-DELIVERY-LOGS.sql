-- MIGRATE-P41-COMMIT-DELIVERY-LOGS.sql
-- Phase 4.1 WS1: Create commit_delivery_logs table
-- Apply via Supabase SQL Editor at:
--   https://supabase.com/dashboard/project/zyvpoyxdxedcugtdrluc/sql
--
-- This table stores per-file commit delivery evidence for the B0.3b Guardian.
-- logCommitDelivery() in commit-reliability.ts writes to this table after every commit.
-- Without this table, logging silently no-ops (non-fatal) but evidence is lost.

CREATE TABLE IF NOT EXISTS public.commit_delivery_logs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id         UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
  repo_name          TEXT        NOT NULL,
  branch_name        TEXT        NOT NULL DEFAULT 'main',
  target_path        TEXT        NOT NULL,
  stub_created       BOOLEAN     NOT NULL DEFAULT FALSE,
  token_refreshed    BOOLEAN     NOT NULL DEFAULT FALSE,
  commit_sha         TEXT,
  commit_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  verification_notes TEXT,
  logged_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast task-level lookups
CREATE INDEX IF NOT EXISTS commit_delivery_logs_task_id_idx
  ON public.commit_delivery_logs(task_id);

-- Index for project-level queries
CREATE INDEX IF NOT EXISTS commit_delivery_logs_project_id_idx
  ON public.commit_delivery_logs(project_id);

-- Index for unverified delivery audit queries
CREATE INDEX IF NOT EXISTS commit_delivery_logs_verified_idx
  ON public.commit_delivery_logs(commit_verified)
  WHERE commit_verified = FALSE;

-- Enable RLS
ALTER TABLE public.commit_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by internal API routes)
CREATE POLICY "service_role_all" ON public.commit_delivery_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own project logs
CREATE POLICY "auth_read_own" ON public.commit_delivery_logs
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Verify table was created
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'commit_delivery_logs'
ORDER BY ordinal_position;
