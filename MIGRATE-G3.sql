-- ─── Block G3: Real QA Gate + Verdict Enforcement ────────────────────────────
-- Migration: 20260401000029_g3_qa_results
-- Purpose:   Create qa_results table for structured QA check storage.
--            Replaces unconditional score=88 auto-pass pattern.
--            Works alongside existing qa_verdicts table.
--
-- NEVER run via pg.Client or node-postgres (RULE-09).
-- Execute in Supabase SQL Editor directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. qa_results table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qa_results (
  id                        uuid          NOT NULL DEFAULT gen_random_uuid(),
  task_id                   uuid          NOT NULL,
  project_id                uuid,
  verdict                   text          NOT NULL,
  score                     integer       NOT NULL,
  qa_type                   text          NOT NULL,
  compilation_passed        boolean,
  requirement_match_passed  boolean,
  contract_check_passed     boolean,
  notes                     text          NOT NULL DEFAULT '',
  evidence_summary          text          NOT NULL DEFAULT '',
  evaluator_model           text          NOT NULL DEFAULT 'buildos-qa-evaluator-v1',
  retry_recommended         boolean       NOT NULL DEFAULT false,
  created_at                timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT qa_results_pkey          PRIMARY KEY (id),
  CONSTRAINT qa_results_verdict_ck    CHECK (verdict IN ('PASS', 'FAIL', 'RETRY_REQUIRED', 'BLOCKED')),
  CONSTRAINT qa_results_qa_type_ck    CHECK (qa_type IN ('code', 'non_code')),
  CONSTRAINT qa_results_score_ck      CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_qa_results_task_id    ON qa_results (task_id);
CREATE INDEX IF NOT EXISTS idx_qa_results_verdict     ON qa_results (verdict);
CREATE INDEX IF NOT EXISTS idx_qa_results_created_at  ON qa_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_results_project_id  ON qa_results (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE qa_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY qa_results_service_all ON qa_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY qa_results_auth_read ON qa_results
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE qa_results IS 'Block G3: Structured QA check results. Replaces unconditional score=88 auto-pass. All verdicts backed by evidence.';
COMMENT ON COLUMN qa_results.compilation_passed IS 'Pattern-based static analysis. NULL for non-code tasks. See QA-Gate-Protocol.md §3 for tsc limitation.';
COMMENT ON COLUMN qa_results.contract_check_passed IS 'NULL if no contract terms found in task description (check not applicable).';
COMMENT ON COLUMN qa_results.evaluator_model IS 'buildos-qa-evaluator-v1 = static analysis (no LLM). Future: buildos-qa-evaluator-v2 = LLM-assisted.';

-- ─── 2. Grant permissions ─────────────────────────────────────────────────────

GRANT ALL ON TABLE qa_results TO service_role;
GRANT SELECT ON TABLE qa_results TO authenticated;
GRANT SELECT ON TABLE qa_results TO anon;

-- ─── 3. Verify ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'qa_results'
  ) THEN
    RAISE EXCEPTION 'Table qa_results was not created. Aborting.';
  ELSE
    RAISE NOTICE 'Table qa_results OK';
  END IF;
  RAISE NOTICE 'Block G3 migration complete: qa_results table created.';
END $$;
