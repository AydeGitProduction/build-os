-- MIGRATE-AUTH-INTEGRATION.sql
-- WS3: Canonical integration state table
-- Run via: Supabase SQL Editor (NOT pg.Client — see feedback)
--
-- Paste this entire file and click Run.
-- Safe to run multiple times (idempotent).

-- ============================================================
-- 1. project_integration_state — canonical single source of truth
-- ============================================================

CREATE TABLE IF NOT EXISTS project_integration_state (
  project_id              UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_installation_id  TEXT        NOT NULL DEFAULT '',
  github_repo_fullname    TEXT        NOT NULL DEFAULT '',   -- "owner/repo"
  vercel_project_id       TEXT        NOT NULL DEFAULT '',
  env_template_version    TEXT        NOT NULL DEFAULT '0.0.0',
  last_verified_at        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_integration_state_pkey PRIMARY KEY (project_id)
);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_pis_project_id ON project_integration_state (project_id);
CREATE INDEX IF NOT EXISTS idx_pis_github_repo ON project_integration_state (github_repo_fullname);
CREATE INDEX IF NOT EXISTS idx_pis_vercel_project ON project_integration_state (vercel_project_id);

-- ============================================================
-- 2. Add blocked_preflight to task status enum (if not already present)
-- ============================================================

DO $$
BEGIN
  -- Only alter if the value doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'blocked_preflight'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')
  ) THEN
    ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'blocked_preflight';
  END IF;
EXCEPTION
  WHEN others THEN
    -- Fallback: task_status may be a text column, not an enum
    RAISE NOTICE 'Could not add blocked_preflight to task_status enum: %', SQLERRM;
END;
$$;

-- ============================================================
-- 3. RLS policies for project_integration_state
-- ============================================================

ALTER TABLE project_integration_state ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all" ON project_integration_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own project's integration state
-- (via workspace membership — mirrors the pattern in projects RLS)
CREATE POLICY "authenticated_read_own" ON project_integration_state
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 4. Backfill: populate from existing project_integrations + deployment_targets
-- ============================================================
-- This populates canonical state for already-bootstrapped projects.
-- Projects with no existing data are skipped (bootstrap will populate on next run).

INSERT INTO project_integration_state (
  project_id,
  github_installation_id,
  github_repo_fullname,
  vercel_project_id,
  env_template_version,
  created_at,
  updated_at
)
SELECT
  p.id                                                          AS project_id,
  COALESCE(pi_env.github_installation_id, '')                   AS github_installation_id,
  COALESCE(
    -- Extract owner/repo from github_repo_url stored in environment_map
    CASE
      WHEN pi.environment_map->>'github_repo_url' LIKE '%github.com/%' THEN
        REGEXP_REPLACE(pi.environment_map->>'github_repo_url', '^.*github\.com/', '')
      ELSE pi.environment_map->>'github_repo_url'
    END,
    ''
  )                                                              AS github_repo_fullname,
  COALESCE(dt.target_config->>'vercel_project_id', '')          AS vercel_project_id,
  '0.0.0'                                                        AS env_template_version,
  NOW()                                                          AS created_at,
  NOW()                                                          AS updated_at
FROM
  projects p
  LEFT JOIN project_integrations pi
    ON pi.project_id = p.id AND pi.status = 'active'
  LEFT JOIN deployment_targets dt
    ON dt.project_id = p.id AND dt.provider = 'vercel' AND dt.status = 'live'
  LEFT JOIN LATERAL (
    -- Attempt to read github_installation_id from environment_map if stored
    SELECT
      COALESCE(pi.environment_map->>'github_installation_id', '') AS github_installation_id
  ) pi_env ON true
WHERE
  -- Only backfill projects that have some integration data
  (pi.id IS NOT NULL OR dt.id IS NOT NULL)
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================
-- 5. Verification query — run after migration to confirm
-- ============================================================

-- SELECT
--   pis.project_id,
--   p.name,
--   pis.github_repo_fullname,
--   pis.vercel_project_id,
--   pis.env_template_version,
--   pis.last_verified_at
-- FROM project_integration_state pis
-- JOIN projects p ON p.id = pis.project_id
-- ORDER BY pis.updated_at DESC
-- LIMIT 20;

SELECT
  COUNT(*) AS rows_in_project_integration_state,
  COUNT(CASE WHEN github_repo_fullname != '' THEN 1 END) AS with_github_repo,
  COUNT(CASE WHEN vercel_project_id != '' THEN 1 END) AS with_vercel_project
FROM project_integration_state;
