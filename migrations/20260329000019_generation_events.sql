-- ============================================================
-- BUILD OS — Migration 019: Generation Events + agent_outputs extension
-- ERT-P3 C2-BE Schema Closure
-- ============================================================

-- ─── generation_events ────────────────────────────────────
-- Audit trail for every /api/agent/generate call.
-- Immutable append-only log.

CREATE TABLE IF NOT EXISTS generation_events (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id       uuid        NOT NULL,
  task_id          uuid        NOT NULL,
  agent_output_id  uuid        NOT NULL,
  status           text        NOT NULL,
  files_written    text[]      NOT NULL DEFAULT '{}',
  errors           text[]      NOT NULL DEFAULT '{}',
  occurred_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ge_pkey           PRIMARY KEY (id),
  CONSTRAINT ge_project_fk     FOREIGN KEY (project_id)     REFERENCES projects(id)      ON DELETE CASCADE,
  CONSTRAINT ge_task_fk        FOREIGN KEY (task_id)        REFERENCES tasks(id)         ON DELETE CASCADE,
  CONSTRAINT ge_output_fk      FOREIGN KEY (agent_output_id) REFERENCES agent_outputs(id) ON DELETE CASCADE,
  CONSTRAINT ge_status_check   CHECK (status IN (
    'pending_generation',
    'generating',
    'files_written',
    'compile_failed'
  ))
);

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ge_project_id     ON generation_events (project_id);
CREATE INDEX IF NOT EXISTS idx_ge_task_id        ON generation_events (task_id);
CREATE INDEX IF NOT EXISTS idx_ge_output_id      ON generation_events (agent_output_id);
CREATE INDEX IF NOT EXISTS idx_ge_status         ON generation_events (status);
CREATE INDEX IF NOT EXISTS idx_ge_occurred_at    ON generation_events (occurred_at DESC);

-- ─── Extend agent_outputs with generation tracking ────────
-- Add generation_status and generated_files columns
-- to support /api/agent/generate pipeline state tracking

ALTER TABLE agent_outputs
  ADD COLUMN IF NOT EXISTS generation_status   text,
  ADD COLUMN IF NOT EXISTS generated_files     text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generation_errors   text[]  DEFAULT '{}';

ALTER TABLE agent_outputs
  ADD CONSTRAINT ao_gen_status_check CHECK (
    generation_status IS NULL OR generation_status IN (
      'pending_generation',
      'generating',
      'files_written',
      'compile_failed'
    )
  );

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;

-- Users can read generation events for their own projects
CREATE POLICY "ge_select" ON generation_events
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())
  );

-- Only service role can insert (API routes use service role key)
CREATE POLICY "generation_events_service_role" ON generation_events
  FOR ALL USING (auth.role() = 'service_role');
