-- PHASE 1.1 — Critical Fix Layer
-- Seeds the Phase 1.1 epic and WS1–WS3 tasks into the Build OS project.
--
-- USAGE: Paste into Supabase SQL Editor → Run
-- Replace :PROJECT_ID with your actual project UUID (e.g. from Supabase → projects table)
--
-- These tasks document the 3 P0 fixes applied in commit 72878d1.
-- They are ALREADY IMPLEMENTED (code fixes, not agent tasks).
-- Status = completed because the fixes are in the repo.

DO $$
DECLARE
  v_project_id UUID := (SELECT id FROM projects ORDER BY created_at DESC LIMIT 1);
  v_epic_id UUID;
  v_feature_ws1 UUID;
  v_feature_ws2 UUID;
  v_feature_ws3 UUID;
  v_epic_order INT;
BEGIN

  -- ── Find project ─────────────────────────────────────────────────────────────
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'No project found in projects table';
  END IF;

  RAISE NOTICE 'Seeding Phase 1.1 for project %', v_project_id;

  -- ── Idempotency ───────────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM epics
    WHERE project_id = v_project_id
    AND title = 'PHASE 1.1 — Critical Fix Layer'
  ) THEN
    RAISE NOTICE 'Phase 1.1 already seeded — skipping';
    RETURN;
  END IF;

  -- ── Epic order ────────────────────────────────────────────────────────────────
  SELECT COALESCE(MAX(order_index), 0) + 1
  INTO v_epic_order
  FROM epics WHERE project_id = v_project_id;

  -- ── Create epic ───────────────────────────────────────────────────────────────
  INSERT INTO epics (project_id, title, description, status, order_index)
  VALUES (
    v_project_id,
    'PHASE 1.1 — Critical Fix Layer',
    'Permanent fixes for 3 P0 blockers identified in Phase 1 reality audit. C-1: Language Lock, C-2: Git Delivery Truth, C-3: G4 Atomicity. Commit: 72878d1.',
    'completed',
    v_epic_order
  )
  RETURNING id INTO v_epic_id;

  -- ── WS1 feature ───────────────────────────────────────────────────────────────
  INSERT INTO features (epic_id, project_id, title, description, status, order_index)
  VALUES (
    v_epic_id, v_project_id,
    'WS1 — Hard Language Lock',
    'Prevent agents from generating Go/Python/Rust code in this TypeScript project.',
    'completed', 1
  )
  RETURNING id INTO v_feature_ws1;

  -- WS1 tasks
  INSERT INTO tasks (feature_id, project_id, title, description, status, agent_role, task_type, order_index)
  VALUES
    (v_feature_ws1, v_project_id,
     'Add TypeScript-only LANGUAGE LOCK to processor.ts system prompts',
     'Add explicit LANGUAGE LOCK to backend_engineer, frontend_engineer, integration_engineer, and fallback system prompts in apps/railway-worker/src/processor.ts. Ban Go, Python, Rust, Java. Implemented in commit 72878d1.',
     'completed', 'backend_engineer', 'code', 1),
    (v_feature_ws1, v_project_id,
     'Add WS1 language gate to generate/route.ts',
     'After parseAgentOutputToOperations(), check if primaryLang is go/python/rust. If so, fail immediately with compile_failed + language_mismatch:true. Implemented in commit 72878d1.',
     'completed', 'backend_engineer', 'code', 2),
    (v_feature_ws1, v_project_id,
     'Validate WS1 fix — run 3 code tasks, Guardian confirms TypeScript-only output',
     'Representative validation: trigger 3 code-type tasks (backend_engineer role), confirm all produce TypeScript (.ts/.tsx) or SQL (.sql) output. Zero Go/Python blocks accepted.',
     'ready', 'qa_security_auditor', 'test', 3);

  -- ── WS2 feature ───────────────────────────────────────────────────────────────
  INSERT INTO features (epic_id, project_id, title, description, status, order_index)
  VALUES (
    v_epic_id, v_project_id,
    'WS2 — Git Delivery Truth',
    'Ensure generation_status accurately reflects git commit state. files_written must only persist when commit succeeds.',
    'completed', 2
  )
  RETURNING id INTO v_feature_ws2;

  -- WS2 tasks
  INSERT INTO tasks (feature_id, project_id, title, description, status, agent_role, task_type, order_index)
  VALUES
    (v_feature_ws2, v_project_id,
     'Add commit_failed to GenerationStatus type',
     'Add ''commit_failed'' to GenerationStatus union type in apps/web/src/lib/types.ts. Represents: files written to project_files DB but git push/verify failed. Implemented in commit 72878d1.',
     'completed', 'backend_engineer', 'code', 1),
    (v_feature_ws2, v_project_id,
     'Update generate/route.ts to set commit_failed on push/verify failure',
     'All 3 failure paths in generate/route.ts (commit fail, verify fail, exception) now call updateGenerationStatus(commit_failed). Final response also returns correct status. Implemented in commit 72878d1.',
     'completed', 'backend_engineer', 'code', 2),
    (v_feature_ws2, v_project_id,
     'Validate WS2 fix — confirm no tasks show files_written without a git commit',
     'Guardian validation: query all tasks with generation_status=files_written. Cross-reference against git log. Any task with files_written but no git commit is a WS2 regression. Target: 0 such tasks.',
     'ready', 'qa_security_auditor', 'test', 3);

  -- ── WS3 feature ───────────────────────────────────────────────────────────────
  INSERT INTO features (epic_id, project_id, title, description, status, order_index)
  VALUES (
    v_epic_id, v_project_id,
    'WS3 — G4 Atomicity Fix',
    'Fix G4 gate path mismatch and race condition that blocks verified tasks.',
    'completed', 3
  )
  RETURNING id INTO v_feature_ws3;

  -- WS3 tasks
  INSERT INTO tasks (feature_id, project_id, title, description, status, agent_role, task_type, order_index)
  VALUES
    (v_feature_ws3, v_project_id,
     'Fix verifyCommitDelivery to apply GITHUB_REPO_PATH_PREFIX',
     'Root cause: commitFilesToGitHub commits files at apps/web/src/lib/foo.ts but verifyCommitDelivery checked src/lib/foo.ts (no prefix) → 404 → task blocked. Fix: apply process.env.GITHUB_REPO_PATH_PREFIX in verifyCommitDelivery. Implemented in commit 72878d1.',
     'completed', 'backend_engineer', 'code', 1),
    (v_feature_ws3, v_project_id,
     'Fix G4 force-block to respect completed task status',
     'G4 gate now checks current task status before forcing to blocked. If QA already set status=completed (fire-and-forget race), G4 does not override. Implemented in commit 72878d1.',
     'completed', 'backend_engineer', 'code', 2),
    (v_feature_ws3, v_project_id,
     'Fix verifyCommitDelivery to treat auth/network errors as non-blocking',
     'Missing env vars, auth errors (401/403), and network errors now return verified=true (infrastructure problem ≠ task failure). Implemented in commit 72878d1.',
     'completed', 'backend_engineer', 'code', 3),
    (v_feature_ws3, v_project_id,
     'Validate WS3 fix — reproduce 583ad2c5 scenario, confirm no false blocks',
     'Guardian validation: trigger a code task, verify it commits to GitHub, confirm G4 does not block it (commit at apps/web/src/... is verified at apps/web/src/... not src/...). Target: zero false-blocked tasks after commit.',
     'ready', 'qa_security_auditor', 'test', 4);

  RAISE NOTICE 'Phase 1.1 seeded successfully: epic=%, WS1=%, WS2=%, WS3=%',
    v_epic_id, v_feature_ws1, v_feature_ws2, v_feature_ws3;

END $$;
