-- ERT-P4 Migration 22: delivery_checkpoints (state transition audit trail)

CREATE TABLE IF NOT EXISTS delivery_checkpoints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_run_id UUID REFERENCES task_runs(id) ON DELETE SET NULL,
  from_state TEXT,         -- previous gate_state (null = initial transition)
  to_state TEXT NOT NULL,  -- new gate_state
  transition_reason TEXT,  -- human or system reason for transition
  blocked_reason_code TEXT REFERENCES blocked_reason_codes(code),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('system', 'agent', 'operator', 'cron', 'webhook')),
  gate_snapshot JSONB DEFAULT '{}',  -- snapshot of all gate states at transition time
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Append-only: no UPDATE or DELETE allowed
CREATE INDEX IF NOT EXISTS idx_delivery_checkpoints_task_id ON delivery_checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_delivery_checkpoints_created ON delivery_checkpoints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_checkpoints_to_state ON delivery_checkpoints(to_state);

-- RLS
ALTER TABLE delivery_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own delivery checkpoints"
  ON delivery_checkpoints FOR SELECT
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN features f ON t.feature_id = f.id
      JOIN epics e ON f.epic_id = e.id
      JOIN projects p ON e.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert delivery checkpoints"
  ON delivery_checkpoints FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- No UPDATE or DELETE policies = append-only enforcement

-- Function to record a gate transition (called by gate engine)
CREATE OR REPLACE FUNCTION record_gate_transition(
  p_task_id UUID,
  p_task_run_id UUID,
  p_from_state TEXT,
  p_to_state TEXT,
  p_reason TEXT,
  p_blocked_code TEXT,
  p_triggered_by TEXT,
  p_gate_snapshot JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checkpoint_id UUID;
BEGIN
  -- Prevent illegal direct jump to 'completed' without going through qa_pending
  IF p_to_state = 'completed' AND p_from_state != 'qa_pending' THEN
    RAISE EXCEPTION 'Illegal gate transition: cannot jump from % to completed without qa_pending', p_from_state;
  END IF;

  INSERT INTO delivery_checkpoints (
    task_id, task_run_id, from_state, to_state, transition_reason,
    blocked_reason_code, triggered_by, gate_snapshot
  ) VALUES (
    p_task_id, p_task_run_id, p_from_state, p_to_state, p_reason,
    p_blocked_code, p_triggered_by, p_gate_snapshot
  ) RETURNING id INTO v_checkpoint_id;

  -- Update the task's current gate_state
  UPDATE tasks SET
    gate_state = p_to_state::task_gate_state,
    gate_state_updated_at = NOW(),
    gate_state_reason = p_reason,
    blocked_reason_code = p_blocked_code
  WHERE id = p_task_id;

  RETURN v_checkpoint_id;
END;
$$;

COMMENT ON TABLE delivery_checkpoints IS 'ERT-P4: Append-only audit trail of task gate state transitions. Every state change is recorded here.';
COMMENT ON FUNCTION record_gate_transition IS 'ERT-P4: Enforces legal transition rules and records audit trail atomically.';
