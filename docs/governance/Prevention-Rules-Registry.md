# BuildOS — Prevention Rules Registry

**Version:** 1.0
**Created:** 2026-03-31
**Block:** G1
**Status:** ACTIVE
**Source:** BuildOS Master Audit 2026-03-31 (Sections 7–8)
**Rule Count:** 23
**DB Table:** `prevention_rules`

---

## Purpose

Every rule in this registry was derived directly from a documented bug, incident report, or architectural risk identified across BuildOS Phases 1–11. Rules are permanent. They are not suggestions. They are enforced at the layer listed under "Enforcement Layer" and owned by the domain listed under "Owner Domain."

No rule may be deleted. Superseded rules are marked `superseded` and replaced with a new rule.

---

## Rule Index

| ID | Title | Severity | Owner | Status |
|----|-------|----------|-------|--------|
| RULE-01 | No .catch() on Supabase QueryBuilder | CRITICAL | backend | active |
| RULE-02 | Always await async returns in try/catch | CRITICAL | backend | active |
| RULE-03 | Stale reset must increment retry_count | HIGH | backend | active |
| RULE-04 | Lock release required on any task reset | CRITICAL | backend | active |
| RULE-05 | STALE_RUN_THRESHOLD > lock_TTL + maxDuration + 300s | CRITICAL | infra | active |
| RULE-06 | _permanent_block required for non-resettable tasks | HIGH | backend | active |
| RULE-07 | Verify column names before any DB insert | HIGH | backend | active |
| RULE-08 | Run supabase gen types after every schema change | HIGH | backend | active |
| RULE-09 | No DDL via pg.Client — SQL Editor only | CRITICAL | infra | active |
| RULE-10 | Epics must seed with status='in_progress' | HIGH | backend | active |
| RULE-11 | Stub file must exist before CREATE_NEW_FILE task | CRITICAL | backend | active |
| RULE-12 | No code task uses agent_role='architect' | CRITICAL | architect | active |
| RULE-13 | Path comment must be first line of every code block | CRITICAL | architect | active |
| RULE-14 | Verify GitHub App token age before code sprint | HIGH | infra | active |
| RULE-15 | No separate QA webhook — all roles use standard dispatch | CRITICAL | backend | active |
| RULE-16 | New agent roles must be added to STANDARD_ONLY_ROLES | HIGH | backend | active |
| RULE-17 | Dual-layer env var protection on any new secret | HIGH | infra | active |
| RULE-18 | Reality score promotion requires direct HTTP probe | CRITICAL | qa | active |
| RULE-19 | FULLY_REAL requires dependent tables verified via API | CRITICAL | qa | active |
| RULE-20 | GO FOR RELEASE requires full E2E proof chain | CRITICAL | qa | active |
| RULE-21 | QA verdict requires tsc check + semantic match | HIGH | qa | active |
| RULE-22 | No task dispatch without active cost_models budget ceiling | HIGH | backend | active |
| RULE-23 | Agents must not write to core infra directories | CRITICAL | architect | active |

---

## Rules (Full Detail)

---

### RULE-01

**Title:** No .catch() on Supabase QueryBuilder
**Description:** Calling `.catch()` on a Supabase `PostgrestFilterBuilder` causes a `TypeError` because PostgrestFilterBuilder does not extend Promise in all versions. Any such call crashes the route silently with an unhandled rejection, returning a 500 with an empty body.
**Trigger Condition:** Any developer or agent writes `.catch()` directly on a Supabase query chain (e.g., `supabase.from('tasks').select('*').catch(...)`)
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-01
**Example Scenario:** `const { data } = await supabase.from('tasks').select('*').catch(err => null)` — this crashes at runtime; must be rewritten as `try { const { data } = await supabase.from('tasks').select('*') } catch(err) { ... }`
**Status:** active

---

### RULE-02

**Title:** Always await async returns in try/catch
**Description:** Any `async function` that returns a Promise must use `return await` when inside a `try/catch` block. Writing `return someAsyncFn()` without `await` causes Promise rejections to escape the try/catch, resulting in unhandled rejections and empty 500 responses.
**Trigger Condition:** An async function uses `return somePromise()` instead of `return await somePromise()` inside a try/catch block.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-17
**Example Scenario:** In seed routes: `return seedFromBlueprint()` was missing `await`. The Promise rejection escaped try/catch silently. Fix: `return await seedFromBlueprint()`
**Status:** active

---

### RULE-03

**Title:** Stale run reset must increment retry_count atomically
**Description:** Whenever a task is reset from `in_progress` or `in_qa` back to `ready` by any cleanup mechanism (watchdog, supervisor, recovery), `retry_count` must be incremented in the same DB operation. Separate updates create a race condition where retry_count can go out of sync, causing tasks to bypass max_retries limits.
**Trigger Condition:** Any code path that updates a task's status to `ready` from a non-initial state without simultaneously updating retry_count.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-13
**Example Scenario:** `supervisor.cleanup_stale_runs` reset task to 'ready' without incrementing retry_count. Tasks bypassed the 3-retry limit and looped indefinitely.
**Status:** active

---

### RULE-04

**Title:** Lock release required on any task reset
**Description:** Any code path that resets a task's status (watchdog, supervisor, recovery, manual) MUST release the resource lock for that task in the same operation. Failure to release the lock causes all subsequent dispatch attempts for that task to fail with "lock not acquired," permanently blocking it without surfacing a clear error.
**Trigger Condition:** A task status is changed to `ready` or `failed` without a corresponding call to release its resource lock.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-19, BUG-20
**Example Scenario:** Watchdog reset tasks to 'ready' but did not delete their `resource_locks` rows. Next dispatch found locks still held → "lock not acquired" cascade blocked 13 QA tasks.
**Status:** active

---

### RULE-05

**Title:** STALE_RUN_THRESHOLD must always exceed lock_TTL + Vercel_maxDuration + 300s
**Description:** `STALE_RUN_THRESHOLD_MS` (the time after which a running task is considered stale) must always be greater than `lock_TTL` (300s) plus `Vercel_maxDuration` (300s) plus a 300-second safety buffer = minimum 900,000ms. The current setting is 600,000ms which provides only a 10-minute window — any future increase to Vercel maxDuration must trigger a review of this threshold.
**Trigger Condition:** STALE_RUN_THRESHOLD_MS ≤ lock_TTL + max task execution time.
**Enforcement Layer:** code
**Owner Domain:** infra
**Source Bug ID:** BUG-21
**Example Scenario:** STALE_RUN_SECONDS was 310 (10s above lock TTL of 300s). A 10-second window allowed lock expiry and stale reset to fire simultaneously, creating a race condition where tasks were reset while still running.
**Status:** active

---

### RULE-06

**Title:** _permanent_block required for non-resettable tasks
**Description:** Any task that should never be reset by stale cleanup (blocked tasks, manually-stopped tasks, tasks with open human decisions) MUST have `context_payload._permanent_block = true` set. Without this flag, `cleanupStaleRuns` will reset them to `ready` on the next tick, overriding the block.
**Trigger Condition:** A task is intended to be permanently blocked but does not have `_permanent_block: true` in its context_payload.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-24
**Example Scenario:** QA tasks blocked pending human review were reset to 'ready' by cleanupStaleRuns because they lacked the `_permanent_block` flag. Fix: added explicit `_permanent_block: true` check in cleanup logic.
**Status:** active

---

### RULE-07

**Title:** Verify column names against current schema before any DB insert
**Description:** Every INSERT statement must be verified against the current table schema before deployment. Supabase silently fails or throws non-descriptive errors when a column name mismatches the schema. The `name` vs `title` discrepancy caused 8-file cascade failures. Schema verification is required whenever a table is referenced for writing.
**Trigger Condition:** Any INSERT or UPDATE that references a column whose existence in the current schema has not been verified.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-04, BUG-15, BUG-18
**Example Scenario:** Epic insert used `name` column; actual schema column is `title`. Seed script inserted epics with wrong column → silent failure → 0 epics, 0 features, 0 tasks created.
**Status:** active

---

### RULE-08

**Title:** Run supabase gen types after every schema change
**Description:** TypeScript type coverage for Supabase was broken from Phase 3 (2026-03-29: 315 errors, 27 untyped tables). Immediately after any schema migration — whether DDL via SQL Editor, migration file, or admin API route — run: `npx supabase gen types typescript --project-id zyvpoyxdxedcugtdrluc > apps/web/src/lib/database.types.ts`. Without updated types, TypeScript provides no protection against column name drift.
**Trigger Condition:** Any new table is created, any column is added/renamed/removed, or any enum is changed.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-33
**Example Scenario:** 6 new tables added in P11.5-c (wizard_sessions, wizard_steps, evaluation_criteria, evaluation_scores, calibration_records, provider_connections) without regenerating types → 27 untyped tables, 315 TypeScript errors.
**Status:** active

---

### RULE-09

**Title:** No DDL via pg.Client — all DDL through Supabase SQL Editor
**Description:** Supabase Supavisor (the connection pooler) rejects raw PostgreSQL password auth (JWT used as PG password), which causes `pg.Client` connections to fail for DDL. All `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `CREATE POLICY` operations MUST go through the Supabase SQL Editor directly (or via the Supabase Management API). Admin migration routes that use pg.Client will silently fail.
**Trigger Condition:** Any DDL operation attempted via pg.Client, node-postgres, or any driver that uses the Supabase connection string as a direct PostgreSQL password.
**Enforcement Layer:** infra
**Owner Domain:** infra
**Source Bug ID:** BUG-30
**Example Scenario:** P11.5 attempted DDL via migration API route using pg.Client. Supavisor rejected JWT as PostgreSQL password. All DDL silently failed. Fix: ran all DDL directly in Supabase SQL Editor.
**Status:** active

---

### RULE-10

**Title:** Epics must seed with status='in_progress' not 'pending'
**Description:** The orchestration tick only unlocks tasks whose parent epic status is `in_progress`. Epics seeded with `status='pending'` prevent all child features and tasks from being dispatched, appearing as if the project is stalled. All seed scripts must set epic `status='in_progress'` at creation time.
**Trigger Condition:** Any seed script or migration that creates epics without explicitly setting `status='in_progress'`.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-14
**Example Scenario:** P9C seed script created epics with default status (null/'pending'). Orchestration tick dispatched 0 tasks despite 34 tasks being seeded. Fix: added `status: 'in_progress'` to all epic inserts in seed scripts.
**Status:** active

---

### RULE-11

**Title:** Stub file must exist in repo before any CREATE_NEW_FILE task is dispatched
**Description:** The n8n commit pipeline requires an existing file SHA to perform a commit. If a task instructs an agent to create a new file and no stub file exists at that path in the GitHub repo, the n8n GitHub step silently skips the commit (no error, no log entry). Before any sprint containing CREATE_NEW_FILE tasks, the Architect must commit empty stub files for all target paths.
**Trigger Condition:** A task with CREATE_NEW_FILE instruction is dispatched without a corresponding stub file already committed at the target path in the GitHub repository.
**Enforcement Layer:** n8n
**Owner Domain:** backend
**Source Bug ID:** BUG-32
**Example Scenario:** Agents produced complete, correct code outputs for new files. n8n silently skipped all commits because the files didn't exist in the repo. 0 of 12 CREATE tasks committed to GitHub. Fix: stub files committed before sprint.
**Status:** active

---

### RULE-12

**Title:** No code task may use agent_role='architect'
**Description:** The `architect` agent_role routes exclusively to the document pipeline in n8n, which does not have a GitHub commit step. Any task that produces TypeScript, JavaScript, or other code must use `agent_role='frontend_engineer'` or `agent_role='backend_engineer'`. Using `architect` for a code task will cause the output to be saved to agent_outputs but never committed to GitHub.
**Trigger Condition:** A task with code generation instructions has `agent_role='architect'` set.
**Enforcement Layer:** code
**Owner Domain:** architect
**Source Bug ID:** IRIS-PROTOCOL-PART-13
**Example Scenario:** A frontend component task was inadvertently assigned `agent_role='architect'`. Agent produced the correct code, n8n processed it through the document pipeline, 0 lines committed to GitHub.
**Status:** active

---

### RULE-13

**Title:** Path comment must be literal first line of every code block
**Description:** The n8n commit pipeline extracts the file path from the first line of the agent's code block output, which must be an exact comment of the format `// apps/web/src/path/to/file.ext`. If the path comment is missing, on the wrong line, or uses a different format, n8n cannot determine the commit target and silently skips the commit. No exceptions.
**Trigger Condition:** An agent code block does not have the path comment as its literal first line, or the comment uses a different format.
**Enforcement Layer:** n8n
**Owner Domain:** architect
**Source Bug ID:** BUG-32
**Example Scenario:** Agent output started with import statements before the path comment. n8n found no path on line 1, could not identify the file, and skipped the commit.
**Status:** active

---

### RULE-14

**Title:** Verify GitHub App installation token age before any code sprint
**Description:** The GitHub App installation token used by n8n for commits has a 1-hour TTL. If the token was issued more than 60 minutes ago, n8n commit steps will return a 401 "Bad credentials" error and silently fail all commits for the sprint. Before dispatching any code sprint, the Architect must verify or refresh the n8n GitHub auth step.
**Trigger Condition:** More than 60 minutes have elapsed since the last successful n8n GitHub commit step execution.
**Enforcement Layer:** n8n
**Owner Domain:** infra
**Source Bug ID:** BUG-31
**Example Scenario:** A 3-hour code sprint dispatched 45 tasks. After the first 60 minutes, all subsequent commits returned 401. 28 completed agent outputs were not committed to GitHub because the installation token expired mid-sprint.
**Status:** active

---

### RULE-15

**Title:** No separate QA webhook — all task roles use standard dispatch webhook
**Description:** `N8N_QA_WEBHOOK_URL` has been permanently deleted and must never be reinstated. All agent roles — including qa_security_auditor — use the standard `N8N_WEBHOOK_URL` (buildos_dispatch_task). Separate QA routing was the root cause of the 13-task QA block incident. The `isQATask` flag in dispatch/task/route.ts must always resolve to `false`.
**Trigger Condition:** Any code, config, or n8n workflow that adds a separate routing path for QA tasks.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-24
**Example Scenario:** N8N_QA_WEBHOOK_URL was set but the QA workflow was not deployed. 13 QA tasks were dispatched to a non-existent webhook, received no acknowledgment, and remained permanently blocked.
**Status:** active

---

### RULE-16

**Title:** New agent roles must be added to STANDARD_ONLY_ROLES
**Description:** `dispatch/task/route.ts` contains a `STANDARD_ONLY_ROLES` constant listing all agent roles that must use the standard dispatch webhook. Any new `agent_role` value added to the system must be added to this array immediately, or it may inadvertently route through a specialized (potentially non-existent) webhook path.
**Trigger Condition:** A new `agent_role` value is used in any task without being added to `STANDARD_ONLY_ROLES` in dispatch/task/route.ts.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** BUG-16
**Example Scenario:** `automation_engineer` role was added to seed scripts but not to STANDARD_ONLY_ROLES. Dispatch logic attempted to route it through a specialized webhook that didn't exist.
**Status:** active

---

### RULE-17

**Title:** Dual-layer env var protection for any new secret
**Description:** When an env var is no longer needed or is being removed, two actions are required: (1) delete the env var from all environments (Vercel, .env.local, n8n), AND (2) disable the code path that reads it. Deleting only the env var leaves code that may attempt to use it and fail silently. Leaving the code path active after env var deletion creates latent failures.
**Trigger Condition:** An env var is deleted without disabling its code path, OR a code path is disabled without removing the env var it depended on.
**Enforcement Layer:** infra
**Owner Domain:** infra
**Source Bug ID:** BUG-24 (recommendation derived from incident)
**Example Scenario:** N8N_QA_WEBHOOK_URL was conceptually removed but the dispatch code still checked for it. The check found it undefined and fell through to error handling unpredictably.
**Status:** active

---

### RULE-18

**Title:** Reality score promotion requires direct HTTP probe
**Description:** No route, table, or capability may be promoted in the Reality Matrix without a direct HTTP probe confirming the actual response code (200, 401, 404, etc.). Agent reasoning ("this route should exist because the file is present") is invalid as evidence. Routes have been deployed with correct file contents and still returned 404 due to build failures. Probe, don't reason.
**Trigger Condition:** A Reality Matrix entry is marked FULLY_REAL based on code review, file presence, or agent inference rather than a direct HTTP call.
**Enforcement Layer:** qa
**Owner Domain:** qa
**Source Bug ID:** BUG-29
**Example Scenario:** P11.4 agents reasoned wizard routes were FULLY_REAL based on file existence. Direct HTTP probes in P11.4-a found all wizard routes returning 404. Reality score was overclaimed by 1.9 points.
**Status:** active

---

### RULE-19

**Title:** FULLY_REAL classification requires dependent tables verified via API
**Description:** No feature may be marked FULLY_REAL if its dependent Supabase tables are unconfirmed. Table verification must be done via a direct API call (SELECT 1 FROM table_name LIMIT 1) — not by checking migration file history. Tables may appear in migration files but fail to exist in the live DB due to DDL errors.
**Trigger Condition:** A feature is promoted to FULLY_REAL while its dependent tables have not been verified via a live DB probe.
**Enforcement Layer:** qa
**Owner Domain:** qa
**Source Bug ID:** BUG-29
**Example Scenario:** wizard_sessions and wizard_steps appeared in migration files but were missing from the live DB (DDL via pg.Client had silently failed). Routes referencing these tables returned 500. Table existence confirmed only after direct Supabase API probe.
**Status:** active

---

### RULE-20

**Title:** GO FOR RELEASE requires full E2E proof chain
**Description:** No release authorization may be issued without verified E2E proof covering the entire BuildOS loop: IRIS wizard creates project → blueprint seeds (5+ epics, 20+ tasks) → orchestration tick dispatches first task → task completes in agent/output → cost event writes to cost_events → UI reflects status change at /projects/[id]. All steps must produce actual HTTP responses and DB writes, not simulated or assumed results.
**Trigger Condition:** A release or "go live" claim is made without documented, timestamped E2E proof of the full loop.
**Enforcement Layer:** qa
**Owner Domain:** qa
**Source Bug ID:** Derived from reality-audit.md Section 7
**Example Scenario:** A Phase report claimed "autonomous code generation working" but the reality-audit revealed 0 files had been committed to the repo by agents. The claim was based on agent_outputs entries, not actual commits.
**Status:** active

---

### RULE-21

**Title:** QA verdict requires TypeScript compilation check and semantic requirement match
**Description:** The auto-QA system currently assigns score=88 unconditionally without performing any evaluation. A valid QA verdict must include at minimum: (1) TypeScript compilation check via `tsc --noEmit` confirming 0 new errors, and (2) semantic verification that the output matches the task's acceptance criteria. Score=88 assigned without these checks is not QA — it is rubber-stamping.
**Trigger Condition:** A QA verdict is issued without running TypeScript compilation and without checking output against task acceptance criteria.
**Enforcement Layer:** qa
**Owner Domain:** qa
**Source Bug ID:** Derived from reality-audit.md Section 7
**Example Scenario:** 306/306 tasks received QA score=88 unconditionally. TypeScript had 315 compilation errors. QA never detected them. All 306 tasks were marked "completed" while the codebase was uncompilable.
**Status:** active

---

### RULE-22

**Title:** No task dispatch without active cost_models budget ceiling
**Description:** Every project must have an active `cost_models` row with a non-null `budget_ceiling` before any task is dispatched. The orchestration tick must verify this ceiling exists and halt if `total_spend_usd >= budget_ceiling`. Without a ceiling, a runaway loop can exhaust API credits without any automatic brake. The $25.64 overnight spend was uncapped.
**Trigger Condition:** An orchestration tick dispatches tasks for a project that has no active cost_models row, or has a cost_models row with budget_ceiling = null.
**Enforcement Layer:** code
**Owner Domain:** backend
**Source Bug ID:** Derived from system-audit-report.md Weakness 4
**Example Scenario:** Overnight autonomous run (2026-03-29) spent $25.64 with no automatic halt. The run continued until Claude credits were exhausted, not until a budget ceiling was hit.
**Status:** active

---

### RULE-23

**Title:** Agents must not write to core infra directories
**Description:** Autonomous agents must never be dispatched with tasks that modify files in the following protected directories: `apps/web/src/app/api/orchestrate/`, `apps/web/src/app/api/dispatch/`, `apps/web/src/app/api/agent/`, `apps/web/src/lib/supervisor.ts`, `apps/web/src/lib/execution.ts`, `apps/web/src/lib/orchestration.ts`. These are the core execution and safety systems. An agent modifying these files could disable stale cleanup, remove lock enforcement, or break the entire orchestration loop. This is the self-modification risk.
**Trigger Condition:** Any task's `context_payload.target_file` points to a protected path, or any agent output contains code modifications to these paths.
**Enforcement Layer:** architect
**Owner Domain:** architect
**Source Bug ID:** Derived from reality-audit.md Risk 10
**Example Scenario:** A hypothetical "refactor orchestration" task dispatched to an agent could produce output that disables cleanupStaleRuns. With the n8n commit pipeline working, this output could be committed to the repo and deployed, silently breaking all loop safety mechanisms.
**Status:** active

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-31 | IRIS Architect (Block G1) | Initial registry created; 23 rules entered from BuildOS Master Audit |

---

*This document is maintained by the IRIS Architect. Rules may only be added, never deleted. Superseded rules must be replaced, not removed.*
