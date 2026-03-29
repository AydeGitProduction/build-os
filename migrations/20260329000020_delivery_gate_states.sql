-- ERT-P4 Migration 20: Gate state enum and task columns
-- Adds gated completion states to tasks table

-- 1. Create gate state enum
CREATE TYPE task_gate_state AS ENUM (
  'implementation_output_ready',
  'file_written',
  'repo_linked',
  'commit_recorded',
  'deployment_pending',
  'verification_pending',
  'qa_pending',
  'completed',
  'blocked',
  'unsupported',
  'infrastructure_blocked'
);

-- 2. Create task type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_delivery_type') THEN
    CREATE TYPE task_delivery_type AS ENUM (
      'code',
      'migration',
      'docs',
      'infra',
      'ui',
      'api',
      'qa',
      'review',
      'schema',
      'generic'
    );
  END IF;
END$$;

-- 3. Add gate state columns to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS gate_state task_gate_state,
  ADD COLUMN IF NOT EXISTS gate_state_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gate_state_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS delivery_type task_delivery_type DEFAULT 'generic';

-- 4. Create blocked_reason_codes lookup table
CREATE TABLE IF NOT EXISTS blocked_reason_codes (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('blocked', 'unsupported', 'infrastructure_blocked')),
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  operator_guidance TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed blocked reason codes
INSERT INTO blocked_reason_codes (code, category, label, description, operator_guidance) VALUES
  ('MISSING_FILE_WRITE', 'blocked', 'Missing File Write', 'Task output has not been written to project_files', 'Ensure agent writes files via /api/agent/generate before marking complete'),
  ('MISSING_REPO_LINK', 'blocked', 'Missing Repo Link', 'No commit linked to this task', 'Ensure GitHub commit is associated with this task_run'),
  ('MISSING_DEPLOY_LINK', 'blocked', 'Missing Deploy Link', 'No Vercel deployment linked to this task', 'Associate a deploy_id with the task_run before advancing'),
  ('VERIFICATION_FAILED', 'blocked', 'Verification Failed', 'Runtime verification check did not pass', 'Review verification_result details and fix underlying issue'),
  ('QA_FAILED', 'blocked', 'QA Failed', 'QA gate did not pass', 'Review QA verdict checks and address failures'),
  ('LOCK_CONFLICT', 'blocked', 'Lock Conflict', 'File lock could not be acquired', 'Wait for current lock holder to release or force-expire after TTL'),
  ('MANUAL_HOLD', 'blocked', 'Manual Hold', 'Task placed on manual hold by operator', 'Operator must explicitly unblock this task'),
  ('DEPENDENCY_BLOCKED', 'blocked', 'Dependency Blocked', 'Upstream dependency task is blocked', 'Resolve upstream task blocking before this one can proceed'),
  ('NO_CODE_OUTPUT', 'unsupported', 'No Code Output', 'Agent produced no extractable code blocks', 'Review agent output format — must include fenced code blocks with filenames'),
  ('ROLE_PATH_VIOLATION', 'unsupported', 'Role Path Violation', 'Agent output references paths outside allowed role boundaries', 'Review ROLE_TO_PATH_MAP and ensure task is assigned correct agent role'),
  ('SCHEMA_CONFLICT', 'unsupported', 'Schema Conflict', 'Migration conflicts with existing schema', 'Review existing migrations and resolve conflict before re-running'),
  ('NO_GATE_POLICY', 'unsupported', 'No Gate Policy', 'Task type has no defined gate policy', 'Define a gate policy for this task delivery_type in gate_policies table'),
  ('VERCEL_BUILD_FAILED', 'infrastructure_blocked', 'Vercel Build Failed', 'Deployment build failed on Vercel', 'Check Vercel build logs and fix compilation errors'),
  ('GITHUB_PUSH_FAILED', 'infrastructure_blocked', 'GitHub Push Failed', 'Git push to repository failed', 'Check GitHub App token validity and repository permissions'),
  ('SUPABASE_MIGRATION_FAILED', 'infrastructure_blocked', 'Supabase Migration Failed', 'Database migration could not be applied', 'Check migration syntax and Supabase project connectivity'),
  ('ANTHROPIC_RATE_LIMITED', 'infrastructure_blocked', 'Anthropic Rate Limited', 'Anthropic API rate limit exceeded', 'Wait for rate limit window to reset or reduce concurrent tasks'),
  ('ENV_VAR_MISSING', 'infrastructure_blocked', 'Env Var Missing', 'Required environment variable not set', 'Configure the missing env var in Vercel project settings')
ON CONFLICT (code) DO NOTHING;

-- 5. Create gate_policies table (task_type → required gates mapping)
CREATE TABLE IF NOT EXISTS gate_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_type task_delivery_type NOT NULL UNIQUE,
  required_gates TEXT[] NOT NULL,
  optional_gates TEXT[],
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed gate policies per task type
INSERT INTO gate_policies (delivery_type, required_gates, optional_gates, description) VALUES
  ('code', ARRAY['file_written', 'repo_linked', 'commit_recorded', 'deployment_pending', 'verification_pending', 'qa_pending'], ARRAY['review'], 'Code tasks require file writes, repo commit, deploy, runtime verification, and QA'),
  ('migration', ARRAY['file_written', 'repo_linked', 'commit_recorded', 'verification_pending', 'qa_pending'], ARRAY[], 'Migration tasks require file write, commit, runtime validation, and QA — no deploy gate'),
  ('api', ARRAY['file_written', 'repo_linked', 'commit_recorded', 'deployment_pending', 'verification_pending', 'qa_pending'], ARRAY[], 'API tasks same as code: full gate set including deploy'),
  ('ui', ARRAY['file_written', 'repo_linked', 'commit_recorded', 'deployment_pending', 'verification_pending', 'qa_pending'], ARRAY['review'], 'UI tasks require full gate set including visual QA'),
  ('infra', ARRAY['repo_linked', 'commit_recorded', 'verification_pending'], ARRAY['deployment_pending', 'qa_pending'], 'Infra tasks require commit and runtime verification minimum'),
  ('docs', ARRAY['file_written', 'repo_linked', 'commit_recorded'], ARRAY['qa_pending'], 'Docs tasks require file write and commit; runtime verification optional'),
  ('qa', ARRAY['qa_pending'], ARRAY['file_written', 'repo_linked'], 'QA tasks must pass their own QA gate; file write optional'),
  ('review', ARRAY['qa_pending'], ARRAY[], 'Review tasks require QA verdict as minimum gate'),
  ('schema', ARRAY['file_written', 'repo_linked', 'commit_recorded', 'verification_pending', 'qa_pending'], ARRAY[], 'Schema tasks same as migration'),
  ('generic', ARRAY['implementation_output_ready', 'qa_pending'], ARRAY['file_written', 'repo_linked'], 'Generic tasks require output and QA minimum')
ON CONFLICT (delivery_type) DO NOTHING;

COMMENT ON TABLE gate_policies IS 'ERT-P4: Maps task delivery_type to required and optional delivery gates';
COMMENT ON TABLE blocked_reason_codes IS 'ERT-P4: Taxonomy of blocked/unsupported/infrastructure_blocked reason codes';
