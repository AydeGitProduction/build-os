-- ============================================================
-- P11.5-b MIGRATION — Run this in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/zyvpoyxdxedcugtdrluc/sql
--
-- This creates all tables needed by the P11.5-b deployed routes.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ── 1. Trigger function (shared) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ── 2. wizard_sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wizard_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       VARCHAR(32) NOT NULL DEFAULT 'OPEN'
               CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED','FAILED')),
  current_step VARCHAR(64),
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_project ON public.wizard_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_user ON public.wizard_sessions(user_id);
DROP TRIGGER IF EXISTS trg_wizard_sessions_updated_at ON public.wizard_sessions;
CREATE TRIGGER trg_wizard_sessions_updated_at
  BEFORE UPDATE ON public.wizard_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.wizard_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wizard_sessions' AND policyname='wses_service_role') THEN
    CREATE POLICY wses_service_role ON public.wizard_sessions AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wizard_sessions TO authenticated;
GRANT ALL ON public.wizard_sessions TO service_role;

-- ── 3. wizard_steps ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wizard_steps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.wizard_sessions(id) ON DELETE CASCADE,
  step_number  INTEGER     NOT NULL CHECK (step_number > 0),
  step_type    VARCHAR(64) NOT NULL,
  data         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wizard_steps_session ON public.wizard_steps(session_id);
DROP TRIGGER IF EXISTS trg_wizard_steps_updated_at ON public.wizard_steps;
CREATE TRIGGER trg_wizard_steps_updated_at
  BEFORE UPDATE ON public.wizard_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.wizard_steps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wizard_steps' AND policyname='wst_service_role') THEN
    CREATE POLICY wst_service_role ON public.wizard_steps AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wizard_steps TO authenticated;
GRANT ALL ON public.wizard_steps TO service_role;

-- ── 4. evaluation_criteria ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id          BIGSERIAL    PRIMARY KEY,
  name        TEXT         NOT NULL UNIQUE,
  description TEXT,
  weight      NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (weight > 0),
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
INSERT INTO public.evaluation_criteria (name, description, weight)
VALUES
  ('correctness',   'Output matches expected result',    1.0),
  ('completeness',  'All required components present',   0.9),
  ('code_quality',  'Clean, maintainable code',          0.8),
  ('test_coverage', 'Tests cover key paths',             0.7)
ON CONFLICT (name) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_criteria TO authenticated;
GRANT ALL ON public.evaluation_criteria TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.evaluation_criteria_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.evaluation_criteria_id_seq TO service_role;

-- ── 5. evaluation_scores ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evaluation_scores (
  id               BIGSERIAL    PRIMARY KEY,
  task_id          UUID         NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  evaluator_id     UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  criteria_id      BIGINT       REFERENCES public.evaluation_criteria(id) ON DELETE SET NULL,
  score            NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  normalized_score NUMERIC(5,4) GENERATED ALWAYS AS (score / 100.0) STORED,
  classification   VARCHAR(8)   NOT NULL DEFAULT 'CNV'
                   CHECK (classification IN ('CNV','FR','NA','SKIP')),
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_task_evaluator_criteria UNIQUE (task_id, evaluator_id, criteria_id)
);
CREATE INDEX IF NOT EXISTS idx_eval_scores_task ON public.evaluation_scores(task_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_classification ON public.evaluation_scores(classification);
ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='evaluation_scores' AND policyname='es_service_role') THEN
    CREATE POLICY es_service_role ON public.evaluation_scores AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_scores TO authenticated;
GRANT ALL ON public.evaluation_scores TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.evaluation_scores_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.evaluation_scores_id_seq TO service_role;

-- ── 6. calibration_records ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calibration_records (
  id                  BIGSERIAL    PRIMARY KEY,
  routing_profile_id  UUID         REFERENCES public.routing_profiles(id) ON DELETE CASCADE,
  model               TEXT         NOT NULL,
  accuracy            NUMERIC(5,4) CHECK (accuracy >= 0 AND accuracy <= 1),
  cost_usd            NUMERIC(10,6) CHECK (cost_usd >= 0),
  sample_size         INTEGER      NOT NULL DEFAULT 0,
  evaluated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cal_records_profile ON public.calibration_records(routing_profile_id);
ALTER TABLE public.calibration_records ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calibration_records' AND policyname='cr_service_role') THEN
    CREATE POLICY cr_service_role ON public.calibration_records AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_records TO authenticated;
GRANT ALL ON public.calibration_records TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.calibration_records_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.calibration_records_id_seq TO service_role;

-- ── 7. provider_connections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_connections (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider            TEXT        NOT NULL CHECK (provider IN ('github','vercel','linear','jira','slack')),
  provider_user_id    TEXT,
  provider_user_login TEXT,
  access_token        TEXT        NOT NULL,
  refresh_token       TEXT,
  scopes              TEXT[]      NOT NULL DEFAULT '{}',
  expires_at          TIMESTAMPTZ,
  connected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_provider_connection UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_provider_connections_user ON public.provider_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_provider ON public.provider_connections(user_id, provider);
DROP TRIGGER IF EXISTS trg_provider_connections_updated_at ON public.provider_connections;
CREATE TRIGGER trg_provider_connections_updated_at
  BEFORE UPDATE ON public.provider_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_connections' AND policyname='pc_service_role') THEN
    CREATE POLICY pc_service_role ON public.provider_connections AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_connections' AND policyname='pc_owner') THEN
    CREATE POLICY pc_owner ON public.provider_connections AS PERMISSIVE FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_connections TO authenticated;
GRANT ALL ON public.provider_connections TO service_role;

-- ── 8. Verify ────────────────────────────────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('wizard_sessions','wizard_steps','evaluation_criteria','evaluation_scores','calibration_records','provider_connections')
ORDER BY tablename;

-- Expected: 6 rows showing all tables above
