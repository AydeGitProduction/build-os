-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: 20260330000024_ert_p6a_runtime_tables
-- ERT-P6A: Railway Execution Runtime — job queue, shadow results, DLQ, heartbeats
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. job_queue ─────────────────────────────────────────────────────────────
-- Central queue: Railway worker polls this for 'queued' jobs.

CREATE TABLE IF NOT EXISTS job_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id   uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  feature_id       uuid,
  project_id       uuid,
  status           text NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  payload          jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  error            text,
  retry_count      int NOT NULL DEFAULT 0,
  worker_id        text
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status         ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_job_queue_correlation_id ON job_queue(correlation_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_task_id        ON job_queue(task_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_created_at     ON job_queue(created_at);

-- ── 2. shadow_results ────────────────────────────────────────────────────────
-- Stores Railway execution results during shadow mode (Vercel is still authoritative).

CREATE TABLE IF NOT EXISTS shadow_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id      uuid NOT NULL,
  task_id             uuid REFERENCES tasks(id) ON DELETE CASCADE,
  execution_target    text NOT NULL CHECK (execution_target IN ('vercel','railway')),
  output              jsonb,
  status              text,
  comparison_match    boolean,
  railway_duration_ms int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_results_correlation_id ON shadow_results(correlation_id);
CREATE INDEX IF NOT EXISTS idx_shadow_results_task_id        ON shadow_results(task_id);
CREATE INDEX IF NOT EXISTS idx_shadow_results_created_at     ON shadow_results(created_at);

-- ── 3. dead_letter_queue ─────────────────────────────────────────────────────
-- Failed callback payloads that need replay or manual review.

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id  uuid,
  task_id         uuid,
  payload         jsonb NOT NULL DEFAULT '{}',
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_correlation_id ON dead_letter_queue(correlation_id);
CREATE INDEX IF NOT EXISTS idx_dlq_created_at     ON dead_letter_queue(created_at);

-- ── 4. worker_heartbeats ─────────────────────────────────────────────────────
-- Railway worker liveness: each worker UPSERT every 30s.

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       text UNIQUE NOT NULL,
  last_seen       timestamptz NOT NULL DEFAULT now(),
  jobs_processed  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_worker_id ON worker_heartbeats(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_seen ON worker_heartbeats(last_seen);
