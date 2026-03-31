/**
 * BUILD OS — P11.6 Roadmap
 * Integration Test Harness + Historical CNV Promotion
 * Seeded via POST /api/projects/[id]/seed-p11-6
 *
 * MODE: DEVELOPER-FIRST | NO NEW FEATURES | REAL RUNTIME PROOF | BACKFILL + PROMOTION
 *
 * Goal: Eliminate CNV by proving runtime or replaying gaps.
 *
 * 7 Workstreams:
 *   WS1 — Test Harness Foundation          (4 tasks)
 *   WS2 — API Validation Suite             (4 tasks)
 *   WS3 — Wizard Flow Test                 (4 tasks)
 *   WS4 — Eval Engine Test                 (3 tasks)
 *   WS5 — CNV Promotion Engine             (4 tasks)
 *   WS6 — Replay List                      (3 tasks)
 *   WS7 — Final Consolidation              (3 tasks)
 *
 * Total: 1 Epic · 7 Features · 25 Tasks
 *
 * Acceptance Criteria:
 *   - Test harness works end-to-end
 *   - Wizard flow verified
 *   - Eval engine verified
 *   - ≥ 80 CNV tasks promoted or resolved
 *   - Reality Score ≥ 88% (Verdict A)
 */

import type { RoadmapEpic } from './build-os-roadmap'

export const P11_6_EPIC_TITLE = 'P11.6 — Integration Test Harness + CNV Promotion'

export const ROADMAP_P11_6_SUMMARY = {
  epic_count:    1,
  feature_count: 7,
  task_count:    25,
  workstreams:   ['WS1', 'WS2', 'WS3', 'WS4', 'WS5', 'WS6', 'WS7'],
}

export const BUILD_OS_ROADMAP_P11_6: RoadmapEpic[] = [
  {
    title: P11_6_EPIC_TITLE,
    description: 'Build integration test harness, run API validation suite, promote CNV tasks to FULLY_REAL by proving runtime behavior.',
    status: 'in_progress',
    features: [
      // ── WS1 — Test Harness Foundation ──────────────────────────────────────
      {
        title: 'WS1 — Test Harness Foundation',
        description: 'Build reusable test infrastructure: auth context, seeded workspace, API-first test runner.',
        workstream: 'WS1',
        tasks: [
          {
            title: 'Map all 877 project tasks by status + classify CNV candidates',
            description: 'Query all tasks in project feb25dda. Group by status. Identify all tasks with status=completed but no verified runtime proof (CNV candidates). Output: task_id list with current classification.',
            role: 'backend_engineer',
            status: 'ready',
            priority: 'critical',
          },
          {
            title: 'Establish authenticated test session via browser extension',
            description: 'Confirm browser session on web-lake-one-88.vercel.app is authenticated. Verify /api/projects returns 200 with real data. Capture workspace_id and project_id for all subsequent test calls.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build Node.js integration test runner script',
            description: 'Write apps/web/scripts/integration-test.ts. Uses SUPABASE_SERVICE_ROLE_KEY to create test user, get JWT, then calls each critical endpoint. Outputs pass/fail per endpoint with HTTP status + response shape.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Seed test data: workspace + project + tasks for integration run',
            description: 'Use admin Supabase client to ensure at least 1 test task exists in evaluation_criteria table and wizard_sessions table. Needed as precondition for WS3 and WS4 tests.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
        ],
      },

      // ── WS2 — API Validation Suite ─────────────────────────────────────────
      {
        title: 'WS2 — API Validation Suite',
        description: 'Validate all critical endpoints return 200/401 (not 404). Confirm response shape and DB writes.',
        workstream: 'WS2',
        tasks: [
          {
            title: 'Validate orchestration routes (status, tick, watchdog, recovery)',
            description: 'Probe: GET /api/orchestrate/status?project_id=feb25dda (expect 200 or 400 with JSON). GET /api/orchestrate/watchdog (expect 200). Confirm routes are live and not 404.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Validate routing intelligence routes (classify, rules, decisions, metrics)',
            description: 'Probe: POST /api/routing/classify, GET /api/routing/rules, GET /api/routing/decisions, GET /api/routing/metrics. Expect 200 or 401, never 404. Confirm response shape matches expected schema.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Validate agent + dispatch routes (generate, execute, dispatch/task)',
            description: 'Probe: POST /api/agent/generate (expect 401 or 400), POST /api/agent/execute (expect 401), POST /api/dispatch/task (expect 401). None should return 404.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Validate provisioning + blueprint routes',
            description: 'Probe: POST /api/projects/feb25dda/provision (expect 401), GET /api/projects/feb25dda/blueprint (expect 200 or 404 with JSON). Confirm shape.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'medium',
          },
        ],
      },

      // ── WS3 — Wizard Flow Test ─────────────────────────────────────────────
      {
        title: 'WS3 — Wizard Flow Test',
        description: 'Simulate full user wizard flow: session create → chat → step record → state restore.',
        workstream: 'WS3',
        tasks: [
          {
            title: 'Create wizard session via authenticated API call',
            description: 'POST /api/wizard/session with valid project_id=feb25dda and user JWT. Expect 201 with { session_id }. Confirm row written to wizard_sessions table via Supabase query.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Send IRIS chat message and confirm wizard_conversations write',
            description: 'POST /api/iris/chat with message + session_id. Expect 200 with { reply, readiness }. Confirm row written to wizard_conversations table. Capture conversation_id.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Record wizard step and verify state progression',
            description: 'POST /api/wizard/{session_id}/step with step data. Expect 201. GET /api/wizard/session to confirm session status updated to IN_PROGRESS. Verify wizard_steps row exists.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Test wizard-state + wizard-readiness + wizard-assumptions routes',
            description: 'GET /api/wizard-state?project_id=feb25dda (expect 200). GET /api/wizard-readiness (expect 200). POST /api/wizard-assumptions (expect 200 or 401). Confirm all return JSON, none 404.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
        ],
      },

      // ── WS4 — Eval Engine Test ─────────────────────────────────────────────
      {
        title: 'WS4 — Eval Engine Test',
        description: 'Prove eval engine end-to-end: trigger evaluation, confirm DB record, check dispatch integration.',
        workstream: 'WS4',
        tasks: [
          {
            title: 'Run evaluate/task on known completed task and confirm scores written',
            description: 'POST /api/evaluate/task with X-Buildos-Secret and task_id=8c1123be-849f-45a0-aff2-f44f68e7380b (known completed task). Expect { success: true, scores_written: 4, average_score, classification }. Confirm evaluation_scores rows in DB.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Run evaluate/task on 5 additional CNV tasks',
            description: 'Identify 5 tasks with status=completed from the CNV candidate list. Run evaluate/task on each. Record average_score and classification for each. Collect evidence for CNV→FR promotion.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Verify QA verdict route + supervisor route',
            description: 'POST /api/qa/verdict (expect 401 or 400 with JSON). GET /api/supervisor (expect 200 or 401). Confirm routes live.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'medium',
          },
        ],
      },

      // ── WS5 — CNV Promotion Engine ─────────────────────────────────────────
      {
        title: 'WS5 — CNV Promotion Engine',
        description: 'For each CNV task: check file exists + route works + DB writes + flow works. Promote to FULLY_REAL or classify REPLAY_REQUIRED/OBSOLETE.',
        workstream: 'WS5',
        tasks: [
          {
            title: 'Audit CNV tasks by workstream: code reality check',
            description: 'For all CNV tasks related to code: verify the referenced file exists in the repo (AydeGitProduction/build-os). If file exists AND compiles → promote to FR. If file missing → REPLAY_REQUIRED.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Audit CNV tasks by workstream: route reality check',
            description: 'For all CNV tasks related to API routes: probe the route on production. If returns 200/401 (not 404) → promote to FR. If 404 → REPLAY_REQUIRED. Batch-test all 56 known routes.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Audit CNV tasks by workstream: DB reality check',
            description: 'For all CNV tasks related to DB schema: query pg_tables to confirm table exists. If table exists with expected columns → promote to FR. If missing → REPLAY_REQUIRED.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Bulk-update task classifications based on promotion evidence',
            description: 'Using evidence from WS5.1-WS5.3, update task records: set reality_classification = FULLY_REAL for proven tasks, REPLAY_REQUIRED for gap tasks, OBSOLETE for superseded tasks. Record count of each.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS6 — Replay List ──────────────────────────────────────────────────
      {
        title: 'WS6 — Replay List',
        description: 'Generate authoritative list of tasks needing replay: missing deployments, missing migrations, broken endpoints.',
        workstream: 'WS6',
        tasks: [
          {
            title: 'Generate REPLAY_REQUIRED task list with gap classification',
            description: 'Compile all tasks identified as REPLAY_REQUIRED from WS5. For each: record gap type (MISSING_FILE / MISSING_ROUTE / MISSING_TABLE / BROKEN_FLOW). Output: structured replay list with priority.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Execute high-priority replays: deploy missing routes',
            description: 'For any REPLAY_REQUIRED tasks where the gap is MISSING_ROUTE: write the route, commit to main, redeploy. Verify route returns 200/401 post-deploy.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Execute high-priority replays: run missing DB migrations',
            description: 'For any REPLAY_REQUIRED tasks where gap is MISSING_TABLE: add SQL to MIGRATE-P11-5B.sql and run via Supabase SQL Editor. Verify table exists post-migration.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'medium',
          },
        ],
      },

      // ── WS7 — Final Consolidation ──────────────────────────────────────────
      {
        title: 'WS7 — Final Consolidation',
        description: 'Produce updated reality classification, final score, and Verdict A/B/C determination.',
        workstream: 'WS7',
        tasks: [
          {
            title: 'Calculate final reality score from promotion evidence',
            description: 'Tally: FR_count × 1.0 + CNV_remaining × 0.7 + SO × 0.1 / 391. Compare to 85.3% baseline. Record tasks promoted, tasks remaining CNV, tasks classified OBSOLETE.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Write integration test evidence record to DB',
            description: 'Insert summary row into system_incidents or a log table recording: test run timestamp, routes tested, tasks promoted, final score, verdict. Provides permanent audit trail.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Produce P11.6 Final Report with Verdict',
            description: 'Write P11.6-FINAL-REPORT-v2.md with: total tasks audited, FR count, CNV remaining, replay executed count, wizard flow proof, eval record, endpoint validation table, updated reality score %, final verdict A/B/C.',
            role: 'backend_engineer',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },
    ],
  },
]
