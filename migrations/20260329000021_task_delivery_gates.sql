-- ERT-P4 Migration 21: task_delivery_gates table
-- Stores per-task gate evaluation records (pass/fail for each gate)

CREATE TABLE IF NOT EXISTS task_delivery_gates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_run_id UUID REFERENCES task_runs(id) ON DELETE SET NULL,
  gate_name TEXT NOT NULL,
  gate_state TEXT NOT NULL CHECK (gate_state IN ('pending', 'passed', 'failed', 'skipped', 'not_required')),
  evaluated_at TIMESTAMPTZ,
  evaluator TEXT,          -- 'system', 'agent', 'operator', 'auto'
  pass_criteria TEXT,      -- what was checked
  failure_reason TEXT,     -- why it failed (if failed)
  artifact_ref TEXT,       -- reference to the artifact that satisfied this gate (file path, commit SHA, deploy ID, etc.)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, gate_name)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_task_delivery_gates_task_id ON task_delivery_gates(task_id);
CREATE INDEX IF NOT EXISTS idx_task_delivery_gates_state ON task_delivery_gates(gate_state);
CREATE INDEX IF NOT EXISTS idx_task_delivery_gates_task_run ON task_delivery_gates(task_run_id);

-- RLS
ALTER TABLE task_delivery_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own task delivery gates"
  ON task_delivery_gates FOR SELECT
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN features f ON t.feature_id = f.id
      JOIN epics e ON f.epic_id = e.id
      JOIN projects p ON e.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage delivery gates"
  ON task_delivery_gates FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE task_delivery_gates IS 'ERT-P4: Per-task gate evaluation records. Each row = one gate check for one task.';
COMMENT ON COLUMN task_delivery_gates.gate_name IS 'One of: implementation_output_ready, file_written, repo_linked, commit_recorded, deployment_pending, verification_pending, qa_pending';
COMMENT ON COLUMN task_delivery_gates.artifact_ref IS 'Pointer to evidence: file path, commit SHA, deploy ID, verification run ID, etc.';
