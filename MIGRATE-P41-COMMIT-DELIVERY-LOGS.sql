-- Phase 4.1 WS1: Create commit_delivery_logs table
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/zyvpoyxdxedcugtdrluc/sql

CREATE TABLE IF NOT EXISTS public.commit_delivery_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  repo_name        TEXT NOT NULL,
  branch_name      TEXT NOT NULL DEFAULT 'main',
  target_path      TEXT NOT NULL,
  stub_created     BOOLEAN NOT NULL DEFAULT FALSE,
  token_refreshed  BOOLEAN NOT NULL DEFAULT FALSE,
  commit_sha       TEXT,
  commit_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  verification_notes TEXT,
  logged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS commit_delivery_logs_task_id_idx ON public.commit_delivery_logs(task_id);
CREATE INDEX IF NOT EXISTS commit_delivery_logs_project_id_idx ON public.commit_delivery_logs(project_id);
CREATE INDEX IF NOT EXISTS commit_delivery_logs_commit_sha_idx ON public.commit_delivery_logs(commit_sha) WHERE commit_sha IS NOT NULL;

-- RLS: allow service role full access (used by admin client in generate route)
ALTER TABLE public.commit_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.commit_delivery_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read their own project logs
CREATE POLICY "Users read own project logs" ON public.commit_delivery_logs
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.commit_delivery_logs IS 
  'Audit log for GitHub commit delivery attempts. Written by /api/agent/generate after each commit + verification step.';
