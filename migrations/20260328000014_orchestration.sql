-- ============================================================
-- BUILD OS — Migration 014: Orchestration Engine
-- Phase 5: Autonomous system activation
-- ============================================================

-- ─── Add safe_stop to project_settings ────────────────────────────────────────
ALTER TABLE project_settings
  ADD COLUMN IF NOT EXISTS safe_stop          boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orchestration_mode text      NOT NULL DEFAULT 'manual'
    CHECK (orchestration_mode IN ('manual','semi_auto','full_auto'));

-- ─── orchestration_runs ───────────────────────────────────────────────────────
-- One row per "tick" of the orchestration loop.
-- Tracks what was dispatched, unlocked, and any guardrail events.
CREATE TABLE IF NOT EXISTS orchestration_runs (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  tick_number       bigint      NOT NULL DEFAULT 1,
  triggered_by      text        NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','auto_completion','cron','api')),
  tasks_dispatched  jsonb       NOT NULL DEFAULT '[]',   -- uuid[]
  tasks_unlocked    jsonb       NOT NULL DEFAULT '[]',   -- uuid[]
  guardrail_hit     boolean     NOT NULL DEFAULT false,
  guardrail_reason  text,
  queue_depth       integer     NOT NULL DEFAULT 0,      -- ready tasks remaining after tick
  active_before     integer     NOT NULL DEFAULT 0,      -- dispatched/in_progress before tick
  active_after      integer     NOT NULL DEFAULT 0,      -- dispatched/in_progress after tick
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orchestration_runs_pkey       PRIMARY KEY (id),
  CONSTRAINT orchestration_runs_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_orchestration_runs_project ON orchestration_runs (project_id, created_at DESC);

ALTER TABLE orchestration_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY orchestration_runs_project_member
  ON orchestration_runs FOR ALL
  USING (project_id IN (SELECT buildos_current_project_ids()));

-- ─── task_dependencies ────────────────────────────────────────────────────────
-- Explicit dependency edges (task → must complete before → dependent_task).
-- The orchestration engine also uses order_index within a feature implicitly,
-- but this table allows cross-feature and cross-epic dependencies.
CREATE TABLE IF NOT EXISTS task_dependencies (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  task_id             uuid        NOT NULL,       -- dependent: must wait
  depends_on_task_id  uuid        NOT NULL,       -- prerequisite: must complete first
  project_id          uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT task_dependencies_pkey    PRIMARY KEY (id),
  CONSTRAINT task_dependencies_unique  UNIQUE (task_id, depends_on_task_id),
  CONSTRAINT task_dependencies_task_fk FOREIGN KEY (task_id)            REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_dependencies_dep_fk  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_dependencies_proj_fk FOREIGN KEY (project_id)         REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT task_dependencies_no_self CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX idx_task_deps_task_id        ON task_dependencies (task_id);
CREATE INDEX idx_task_deps_depends_on     ON task_dependencies (depends_on_task_id);
CREATE INDEX idx_task_deps_project        ON task_dependencies (project_id);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_dependencies_project_member
  ON task_dependencies FOR ALL
  USING (project_id IN (SELECT buildos_current_project_ids()));

-- ─── Orchestration helper: find tasks ready to unlock ─────────────────────────
-- Returns tasks that are 'pending' AND have all their prerequisites completed.
-- Used by the orchestration tick to advance the queue.
CREATE OR REPLACE FUNCTION buildos_find_unlockable_tasks(p_project_id uuid)
RETURNS TABLE(task_id uuid, unlock_reason text) AS $$
BEGIN
  RETURN QUERY
  -- Tasks with no explicit deps AND lower order_index siblings all done
  SELECT t.id, 'order_index_complete'::text
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND t.order_index > 0
    AND NOT EXISTS (
      -- no explicit dep edges on this task
      SELECT 1 FROM task_dependencies td WHERE td.task_id = t.id
    )
    AND NOT EXISTS (
      -- all lower-order tasks in same feature must be completed
      SELECT 1 FROM tasks t2
      WHERE t2.feature_id = t.feature_id
        AND t2.order_index < t.order_index
        AND t2.status NOT IN ('completed', 'cancelled')
    )

  UNION ALL

  -- Tasks with explicit deps where ALL deps are completed
  SELECT t.id, 'deps_complete'::text
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND EXISTS (SELECT 1 FROM task_dependencies td WHERE td.task_id = t.id)
    AND NOT EXISTS (
      SELECT 1 FROM task_dependencies td
      JOIN tasks dep ON dep.id = td.depends_on_task_id
      WHERE td.task_id = t.id
        AND dep.status NOT IN ('completed', 'cancelled')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to service_role
GRANT EXECUTE ON FUNCTION buildos_find_unlockable_tasks(uuid) TO service_role;
