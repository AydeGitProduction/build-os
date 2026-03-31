-- ─── Block G1: Prevention Rules Registry ──────────────────────────────────────
-- Migration: 20260331000027_prevention_rules
-- Purpose:   Create prevention_rules table, seed all 23 rules, add prevention_rule_id
--            FK to system_incidents for enforcement tracking.
--
-- NEVER run via pg.Client or node-postgres (RULE-09).
-- Execute in Supabase SQL Editor directly.
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── 1. prevention_rules table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prevention_rules (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid(),
  rule_code           text          NOT NULL,
  title               text          NOT NULL,
  description         text          NOT NULL,
  trigger_condition   text          NOT NULL,
  enforcement_type    text          NOT NULL,
  owner_domain        text          NOT NULL,
  source_bug_id       text          NOT NULL,
  example             text          NOT NULL,
  status              text          NOT NULL DEFAULT 'active',
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT prevention_rules_pkey           PRIMARY KEY (id),
  CONSTRAINT prevention_rules_rule_code_uq   UNIQUE (rule_code),
  CONSTRAINT prevention_rules_status_check   CHECK (status IN ('active', 'superseded', 'draft')),
  CONSTRAINT prevention_rules_enforcement_ck CHECK (enforcement_type IN ('code', 'n8n', 'qa', 'architect', 'infra')),
  CONSTRAINT prevention_rules_owner_ck       CHECK (owner_domain IN ('backend', 'infra', 'qa', 'architect'))
);

CREATE INDEX IF NOT EXISTS idx_prevention_rules_status ON prevention_rules (status);
CREATE INDEX IF NOT EXISTS idx_prevention_rules_owner  ON prevention_rules (owner_domain);

ALTER TABLE prevention_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY prevention_rules_service_all ON prevention_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY prevention_rules_anon_read ON prevention_rules
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE prevention_rules IS 'Block G1: Formal prevention rules registry. One rule per documented bug/risk. Never delete rows; use status=superseded.';

-- ─── 2. Add prevention_rule_id FK to system_incidents ─────────────────────────
-- Allows incidents to be linked to the prevention rule that governs their fix.
-- Required for incident closure enforcement (cannot close without a rule link).

ALTER TABLE system_incidents
  ADD COLUMN IF NOT EXISTS prevention_rule_id uuid REFERENCES prevention_rules(id) ON DELETE SET NULL;

ALTER TABLE system_incidents
  ADD COLUMN IF NOT EXISTS rule_closure_notes text;

COMMENT ON COLUMN system_incidents.prevention_rule_id  IS 'Block G1: FK to prevention_rules. Required before status=resolved.';
COMMENT ON COLUMN system_incidents.rule_closure_notes  IS 'Block G1: Notes on how the prevention rule applies to this incident.';

-- ─── 3. Seed all 23 prevention rules ──────────────────────────────────────────

INSERT INTO prevention_rules
  (rule_code, title, description, trigger_condition, enforcement_type, owner_domain, source_bug_id, example, status)
VALUES
  (
    'RULE-01',
    'No .catch() on Supabase QueryBuilder',
    'Calling .catch() on a Supabase PostgrestFilterBuilder causes a TypeError because PostgrestFilterBuilder does not extend Promise in all versions. This crashes the route silently with an unhandled rejection, returning a 500 with an empty body.',
    'Any developer or agent writes .catch() directly on a Supabase query chain.',
    'code',
    'backend',
    'BUG-01',
    'supabase.from(''tasks'').select(''*'').catch(err => null) must be rewritten as try { const { data } = await supabase.from(''tasks'').select(''*'') } catch(err) { ... }',
    'active'
  ),
  (
    'RULE-02',
    'Always await async returns in try/catch blocks',
    'Any async function that returns a Promise must use return await when inside a try/catch block. Writing return someAsyncFn() without await causes Promise rejections to escape the try/catch, resulting in unhandled rejections and empty 500 responses.',
    'An async function uses return somePromise() instead of return await somePromise() inside a try/catch block.',
    'code',
    'backend',
    'BUG-17',
    'In seed routes: return seedFromBlueprint() was missing await. Fix: return await seedFromBlueprint()',
    'active'
  ),
  (
    'RULE-03',
    'Stale run reset must increment retry_count atomically',
    'Whenever a task is reset from in_progress or in_qa back to ready by any cleanup mechanism (watchdog, supervisor, recovery), retry_count must be incremented in the same DB operation. Separate updates create a race condition where tasks bypass max_retries.',
    'Any code path that updates a task status to ready from a non-initial state without simultaneously updating retry_count.',
    'code',
    'backend',
    'BUG-13',
    'supervisor.cleanup_stale_runs reset task to ready without incrementing retry_count. Tasks bypassed the 3-retry limit and looped indefinitely.',
    'active'
  ),
  (
    'RULE-04',
    'Lock release required on any task reset',
    'Any code path that resets a task status (watchdog, supervisor, recovery, manual) MUST release the resource lock for that task in the same operation. Failure releases cause all subsequent dispatch attempts to fail with lock not acquired.',
    'A task status is changed to ready or failed without a corresponding call to release its resource lock.',
    'code',
    'backend',
    'BUG-19',
    'Watchdog reset tasks to ready but did not delete resource_locks rows. Next dispatch found locks still held — lock not acquired cascade blocked 13 QA tasks.',
    'active'
  ),
  (
    'RULE-05',
    'STALE_RUN_THRESHOLD must exceed lock_TTL + Vercel_maxDuration + 300s buffer',
    'STALE_RUN_THRESHOLD_MS must always be greater than lock_TTL (300s) plus Vercel_maxDuration (300s) plus a 300-second safety buffer = minimum 900,000ms. Current setting: 600,000ms.',
    'STALE_RUN_THRESHOLD_MS is set to a value less than or equal to lock_TTL plus max task execution time.',
    'infra',
    'infra',
    'BUG-21',
    'STALE_RUN_SECONDS=310 created a 10-second race window with lock TTL=300s. Tasks reset while still running.',
    'active'
  ),
  (
    'RULE-06',
    '_permanent_block required for non-resettable tasks',
    'Any task that should never be reset by stale cleanup must have context_payload._permanent_block = true. Without this flag, cleanupStaleRuns will reset it to ready on the next tick.',
    'A task is intended to be permanently blocked but does not have _permanent_block: true in its context_payload.',
    'code',
    'backend',
    'BUG-24',
    'QA tasks blocked pending human review were reset to ready by cleanupStaleRuns because they lacked the _permanent_block flag.',
    'active'
  ),
  (
    'RULE-07',
    'Verify column names against current schema before any DB insert',
    'Every INSERT statement must be verified against the current table schema before deployment. Supabase silently fails when a column name mismatches the schema. The name vs title discrepancy caused 8-file cascade failures.',
    'Any INSERT or UPDATE that references a column whose existence in the current schema has not been verified.',
    'code',
    'backend',
    'BUG-04',
    'Epic insert used name column; actual schema column is title. Seed script inserted epics with wrong column — silent failure — 0 epics created.',
    'active'
  ),
  (
    'RULE-08',
    'Run supabase gen types after every schema change',
    'TypeScript type coverage for Supabase was broken from Phase 3 (315 errors, 27 untyped tables). After any schema migration, run: npx supabase gen types typescript --project-id zyvpoyxdxedcugtdrluc > apps/web/src/lib/database.types.ts',
    'Any new table is created, any column is added/renamed/removed, or any enum is changed.',
    'code',
    'backend',
    'BUG-33',
    '6 new tables added in P11.5-c without regenerating types. Result: 27 untyped tables, 315 TypeScript errors.',
    'active'
  ),
  (
    'RULE-09',
    'No DDL via pg.Client — all DDL through Supabase SQL Editor only',
    'Supabase Supavisor rejects raw PostgreSQL password auth (JWT used as PG password), causing pg.Client DDL to fail silently. All CREATE TABLE, ALTER TABLE, CREATE INDEX, CREATE POLICY must go through Supabase SQL Editor directly.',
    'Any DDL operation attempted via pg.Client, node-postgres, or any driver using the Supabase connection string as a direct PostgreSQL password.',
    'infra',
    'infra',
    'BUG-30',
    'P11.5 attempted DDL via migration API route using pg.Client. Supavisor rejected JWT. All DDL silently failed.',
    'active'
  ),
  (
    'RULE-10',
    'Epics must seed with status=in_progress not pending',
    'The orchestration tick only unlocks tasks whose parent epic status is in_progress. Epics seeded with status=pending prevent all child features and tasks from being dispatched.',
    'Any seed script or migration that creates epics without explicitly setting status=in_progress.',
    'code',
    'backend',
    'BUG-14',
    'P9C seed script created epics with default status=pending. Orchestration tick dispatched 0 tasks despite 34 tasks seeded.',
    'active'
  ),
  (
    'RULE-11',
    'Stub file must exist in repo before any CREATE_NEW_FILE task dispatch',
    'The n8n commit pipeline requires an existing file SHA to perform a commit. Without a stub file at the target path, n8n silently skips the commit with no error.',
    'A task with CREATE_NEW_FILE instruction is dispatched without a stub file committed at the target path in the GitHub repository.',
    'n8n',
    'backend',
    'BUG-32',
    'Agents produced correct code for new files. n8n silently skipped all commits because files did not exist in the repo. 0 of 12 CREATE tasks committed.',
    'active'
  ),
  (
    'RULE-12',
    'No code task may use agent_role=architect',
    'The architect agent_role routes to the document pipeline in n8n, which has no GitHub commit step. Code tasks must use frontend_engineer or backend_engineer.',
    'A task with code generation instructions has agent_role=architect set.',
    'architect',
    'architect',
    'IRIS-PROTOCOL-PART-13',
    'A frontend component task assigned agent_role=architect. Agent produced correct code, n8n processed it through document pipeline, 0 lines committed to GitHub.',
    'active'
  ),
  (
    'RULE-13',
    'Path comment must be literal first line of every agent code block',
    'The n8n commit pipeline extracts the file path from line 1 of the agent code block. Format: // apps/web/src/path/to/file.ext — no exceptions.',
    'An agent code block does not have the path comment as its literal first line, or uses a different comment format.',
    'n8n',
    'architect',
    'BUG-32',
    'Agent output started with import statements before the path comment. n8n found no path on line 1 and skipped the commit.',
    'active'
  ),
  (
    'RULE-14',
    'Verify GitHub App installation token age before any code sprint',
    'The GitHub App installation token used by n8n has a 1-hour TTL. If the token is older than 60 minutes, n8n commit steps return 401 and silently fail all commits.',
    'More than 60 minutes have elapsed since the last successful n8n GitHub commit step execution.',
    'n8n',
    'infra',
    'BUG-31',
    'A 3-hour code sprint dispatched 45 tasks. After 60 minutes, all commits returned 401. 28 agent outputs were never committed.',
    'active'
  ),
  (
    'RULE-15',
    'No separate QA webhook — all roles use standard dispatch webhook',
    'N8N_QA_WEBHOOK_URL has been permanently deleted and must never be reinstated. All agent roles use the standard N8N_WEBHOOK_URL. isQATask in dispatch must always resolve to false.',
    'Any code, config, or n8n workflow adds a separate routing path for QA tasks.',
    'code',
    'backend',
    'BUG-24',
    'N8N_QA_WEBHOOK_URL was set but QA workflow was not deployed. 13 QA tasks dispatched to non-existent webhook, permanently blocked.',
    'active'
  ),
  (
    'RULE-16',
    'New agent roles must be added to STANDARD_ONLY_ROLES',
    'dispatch/task/route.ts contains STANDARD_ONLY_ROLES listing all roles that must use the standard dispatch webhook. Any new agent_role must be added to this array immediately.',
    'A new agent_role value is used in any task without being added to STANDARD_ONLY_ROLES in dispatch/task/route.ts.',
    'code',
    'backend',
    'BUG-16',
    'automation_engineer role added to seed scripts but not to STANDARD_ONLY_ROLES. Dispatch attempted to route through a specialized webhook that did not exist.',
    'active'
  ),
  (
    'RULE-17',
    'Dual-layer env var protection for any new secret removal',
    'When removing an env var: (1) delete from all environments AND (2) disable the code path that reads it. Deleting only the var leaves latent failures; leaving only the code path creates unpredictable behavior.',
    'An env var is deleted without disabling its code path, or a code path is disabled without removing the env var.',
    'infra',
    'infra',
    'BUG-24',
    'N8N_QA_WEBHOOK_URL was conceptually removed but dispatch code still checked for it. The check found undefined and fell through to error handling unpredictably.',
    'active'
  ),
  (
    'RULE-18',
    'Reality score promotion requires direct HTTP probe evidence',
    'No route or capability may be promoted in the Reality Matrix without a direct HTTP probe confirming the actual response code. Agent reasoning is invalid as evidence.',
    'A Reality Matrix entry is marked FULLY_REAL based on code review, file presence, or agent inference rather than a direct HTTP call.',
    'qa',
    'qa',
    'BUG-29',
    'P11.4 agents reasoned wizard routes were FULLY_REAL based on file existence. Direct HTTP probes found all wizard routes returning 404. Reality score overclaimed by 1.9 points.',
    'active'
  ),
  (
    'RULE-19',
    'FULLY_REAL classification requires dependent tables verified via live API probe',
    'No feature may be marked FULLY_REAL if its dependent Supabase tables are unconfirmed. Table verification must be done via a direct API call, not migration file history.',
    'A feature is promoted to FULLY_REAL while its dependent tables have not been verified via a live DB probe.',
    'qa',
    'qa',
    'BUG-29',
    'wizard_sessions and wizard_steps appeared in migration files but were missing from the live DB. Routes returned 500. Confirmed missing only after direct Supabase API probe.',
    'active'
  ),
  (
    'RULE-20',
    'GO FOR RELEASE requires full E2E proof chain',
    'No release authorization may be issued without verified E2E proof: IRIS wizard creates project → blueprint seeds → tick dispatches → task completes → cost event writes → UI reflects. All steps must produce actual HTTP responses and DB writes.',
    'A release or go-live claim is made without documented, timestamped E2E proof of the full loop.',
    'qa',
    'qa',
    'REALITY-AUDIT-2026-03-29',
    'A phase report claimed autonomous code generation working. Reality-audit revealed 0 files had been committed to repo by agents. Claim was based on agent_outputs entries, not actual commits.',
    'active'
  ),
  (
    'RULE-21',
    'QA verdict requires TypeScript compilation check and semantic requirement match',
    'A valid QA verdict must include: (1) TypeScript compilation check via tsc --noEmit confirming 0 new errors, and (2) semantic verification that output matches task acceptance criteria. Score=88 unconditional is not QA.',
    'A QA verdict is issued without running TypeScript compilation and without checking output against task acceptance criteria.',
    'qa',
    'qa',
    'REALITY-AUDIT-2026-03-29',
    '306/306 tasks received QA score=88 unconditionally. TypeScript had 315 compilation errors. QA never detected them. All 306 marked completed while codebase was uncompilable.',
    'active'
  ),
  (
    'RULE-22',
    'No task dispatch without active cost_models budget ceiling',
    'Every project must have an active cost_models row with a non-null budget_ceiling before any task is dispatched. The orchestration tick must halt if total_spend_usd >= budget_ceiling.',
    'An orchestration tick dispatches tasks for a project that has no active cost_models row, or has budget_ceiling = null.',
    'code',
    'backend',
    'SYSTEM-AUDIT-2026-03-29',
    'Overnight autonomous run spent $25.64 with no automatic halt. Run continued until Claude credits were exhausted, not until a budget ceiling was hit.',
    'active'
  ),
  (
    'RULE-23',
    'Agents must not write to core infra directories',
    'Autonomous agents must never be dispatched with tasks that modify files in: apps/web/src/app/api/orchestrate/, apps/web/src/app/api/dispatch/, apps/web/src/app/api/agent/, lib/supervisor.ts, lib/execution.ts, lib/orchestration.ts. These are the core execution and safety systems.',
    'Any task target_file points to a protected path, or any agent output contains code modifications to these paths.',
    'architect',
    'architect',
    'REALITY-AUDIT-RISK-10',
    'A hypothetical refactor orchestration task dispatched to an agent could produce output that disables cleanupStaleRuns. With n8n commit pipeline working, this could be deployed, silently breaking all loop safety mechanisms.',
    'active'
  )
ON CONFLICT (rule_code) DO NOTHING;

-- ─── 4. Verify seed count ──────────────────────────────────────────────────────
-- Expected: 23 rows
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM prevention_rules WHERE status = 'active';
  IF v_count < 23 THEN
    RAISE WARNING 'prevention_rules seed count is %. Expected 23. Check for conflicts or failures.', v_count;
  ELSE
    RAISE NOTICE 'prevention_rules seed OK: % active rules', v_count;
  END IF;
END $$;

-- ─── Done ─────────────────────────────────────────────────────────────────────
COMMENT ON TABLE  prevention_rules IS 'Block G1: 23 prevention rules derived from BuildOS bug/incident history. Permanent — rules never deleted.';
