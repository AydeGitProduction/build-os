-- migrations/20240115_wizard_conversations_trigger_fields.sql
-- I5-BE: Add trigger_reason, trigger_fired, gate_score, gate_blocked columns
-- to wizard_conversations for confidence threshold tracking

ALTER TABLE wizard_conversations
  ADD COLUMN IF NOT EXISTS trigger_reason    TEXT,
  ADD COLUMN IF NOT EXISTS trigger_fired     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gate_score        SMALLINT,
  ADD COLUMN IF NOT EXISTS gate_blocked      BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for analytics queries: find all gated completions
CREATE INDEX IF NOT EXISTS idx_wizard_conversations_trigger_fired
  ON wizard_conversations (trigger_fired)
  WHERE trigger_fired = TRUE;

-- Index for debugging blocked attempts
CREATE INDEX IF NOT EXISTS idx_wizard_conversations_gate_blocked
  ON wizard_conversations (gate_blocked)
  WHERE gate_blocked = TRUE;

COMMENT ON COLUMN wizard_conversations.trigger_reason IS
  'Format: confidence_threshold_met:score=<N>,fields=<N>/<total> — set only on completion';

COMMENT ON COLUMN wizard_conversations.trigger_fired IS
  'TRUE only when score >= 70 and all required fields are present at completion';

COMMENT ON COLUMN wizard_conversations.gate_score IS
  'Readiness score (0–100) computed at completion attempt time';

COMMENT ON COLUMN wizard_conversations.gate_blocked IS
  'TRUE when COMPLETE_JSON was emitted but gate rejected it';