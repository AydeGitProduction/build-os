-- migrations/add_iris_confidence_gate_columns.sql
-- I5-BE: Add trigger_reason and trigger_fired columns to wizard_conversations
-- Run this migration before deploying the confidence gate

BEGIN;

-- Add trigger tracking columns to wizard_conversations
ALTER TABLE wizard_conversations
  ADD COLUMN IF NOT EXISTS trigger_fired BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trigger_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add wizard completion tracking to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS wizard_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wizard_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wizard_trigger_reason TEXT;

-- Add readiness tracking to project_questionnaires
ALTER TABLE project_questionnaires
  ADD COLUMN IF NOT EXISTS readiness_score INTEGER,
  ADD COLUMN IF NOT EXISTS trigger_reason TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Index for gate analytics: find all rejected completions
CREATE INDEX IF NOT EXISTS idx_wizard_conv_trigger_fired
  ON wizard_conversations (project_id, trigger_fired)
  WHERE trigger_fired = true;

-- Index for observability: find all gate rejections
CREATE INDEX IF NOT EXISTS idx_wizard_conv_gate_rejected
  ON wizard_conversations (project_id, role)
  WHERE role = 'system_gate';

COMMENT ON COLUMN wizard_conversations.trigger_fired IS
  'True when this assistant message triggered wizard completion (score >= threshold)';

COMMENT ON COLUMN wizard_conversations.trigger_reason IS
  'E.g. confidence_threshold_met:score=85,fields=6/7 or gate_rejected:score=35,missing=core_problem,...';

COMMENT ON COLUMN wizard_conversations.metadata IS
  'JSON blob with readiness score, field counts, gate details';

COMMIT;