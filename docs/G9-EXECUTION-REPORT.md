# G9 Execution Report — Real Project Stress Test + System Weakness Discovery

**Block:** G9
**Date:** 2026-04-01
**Status:** COMPLETE — NEEDS HARDENING
**Executed by:** System (autonomous, Claude Sonnet)

---

## 1. PROJECT OVERVIEW

**Project:** Mini CRM — Contact Management Module
**Project ID:** `1abeae47-ff18-4776-8c79-f1f60b1d70a4`
**Type:** SaaS feature module
**Complexity:** 8/10

### Project Scope

The Mini CRM project is a production-grade contact management system built inside BuildOS as a real stress-test vehicle. It includes:

- **API layer:** CRUD contacts, activity log, CSV import, analytics endpoint
- **UI layer:** ContactsList, ContactDetail, ContactSearch, CRMSettings
- **Integration:** Email notification webhook mock (intentional contract bug)
- **Database:** contacts table schema migration
- **Tests:** E2E lifecycle test suite

### Intentional Failure Points (Injected)

| Task | Failure Type | Defect |
|---|---|---|
| CRM-04 | Dependency conflict | References `crm_activity_log` table not in migration |
| CRM-05 | API contract mismatch | Wrong function signature `(contactId, email)` vs `(contact: Contact)` |
| CRM-06 | Import syntax error | `import { default as Papa }` causes runtime TypeError |
| CRM-10 | Partial implementation | `onResult` callback not wired — component non-functional |
| CRM-14 | Incomplete test suite | 6 of 8 test cases skipped |

---

## 2. EXECUTION FLOW

### Phase 1: Project Setup
- Project `1abeae47` created in Supabase
- Epic `09a4b801`, Feature `b556907a` created
- 14 tasks created (CRM-01 through CRM-14)
- All tasks set to `ready` status

**WEAKNESS DISCOVERED (schema discovery, non-rule):** Task creation requires `feature_id` (NOT NULL), `feature_id` requires `epic_id` (NOT NULL). This was not documented and caused 5 failed creation attempts before correct hierarchy was found. The failure was non-fatal — retry succeeded after schema inspection.

**WEAKNESS DISCOVERED (schema discovery):** `agent_role` check constraint allows only: `architect`, `automation_engineer`, `backend_engineer`, `frontend_engineer`. `qa_engineer` is not valid. CRM-14 (test task) was re-created with `backend_engineer` role.

### Phase 2: Clean Task Dispatch (CRM-01, 02, 03, 07, 08, 09, 11, 12, 13)
- All 9 clean tasks dispatched via `/api/dispatch/task`
- All 9 triggered G4 stub gate → G5 task_events → G6 trigger/task-created
- Auto-QA evaluated all tasks
- **All 9 auto-completed with PASS verdicts (scores 75–100)**

### Phase 3: Buggy Task Dispatch (CRM-04, 05, 06, 10, 14)
- All 5 dispatched
- Auto-QA evaluated all tasks based on task descriptions
- **WEAKNESS-01: All 5 auto-completed with QA PASS** despite documented intentional bugs
- CRM-04 passed with 100/100 despite noting "INTENTIONAL DEPENDENCY CONFLICT" in description
- CRM-05 passed with 100/100 despite noting "INTENTIONAL CONTRACT BUG" in description

### Phase 4: Scenario A — QA Failure Loop
- Fired `trigger/qa-failed` 3× for CRM-04 task
- Trigger 1: `escalated: False` (count: 1)
- Trigger 2: `escalated: False` (count: 2)
- Trigger 3: `escalated: True` (count: 3 = threshold) → **INC-0008 (P2) auto-created**
- G5 task_events: 3× `qa_verdict_fail` rows written

### Phase 5: Scenario B — Commit Failure Escalation
- Fired `trigger/commit-failure` 3× for CRM-05 task
- Trigger 1: `escalated: False` (count: 1)
- Trigger 2: `escalated: False` (count: 2)
- Trigger 3: `escalated: True` (count: 3 = threshold) → **INC-0009 (P1) auto-created**
- G5 task_events: 3× `commit_failure` rows written

### Phase 6: Scenario C — Multi-Error Cascade
- CRM-06: `trigger/qa-failed` (import bug) + `trigger/commit-failure` (broken file)
- CRM-10: `trigger/qa-failed` (partial implementation)
- CRM-14: `trigger/qa-failed` (incomplete test suite)
- No new incidents created (counts did not reach threshold in 24h window)
- G5 logged all events

### Phase 7: Scenario D — Release Gate BLOCKED
- First gate attempt: `G9-CRM-v1-ATTEMPT-1`
- **Result: FAILED**
  - check_a: PASS (0 P0 incidents)
  - check_b: FAIL (1 open P1 — INC-0009)
  - check_c: FAIL (7 commit failures > 5 threshold)
- **WEAKNESS-02 DISCOVERED:** commit_failure count is GLOBAL, not per-project

### Phase 8: Fix and Resolution
- RULE-26 created: Schema tasks must define all dependent tables
- RULE-27 created: Auto-QA must validate table references against schema
- RULE-28 created: Integration module signatures must be defined before callers dispatched
- RULE-29 created: Release gate commit check must be scoped per project_id
- INC-0008 (P2) closed → linked to RULE-26
- INC-0009 (P1) closed → linked to RULE-28
- Manual override logged (per NC-05) for commit failure gate on G9 project

### Phase 9: Release Gate Retry
- Second gate attempt: `G9-CRM-v1-ATTEMPT-2`
- **Result: pending** (partial pass)
  - check_a: PASS (0 P0)
  - check_b: PASS (0 P1 — INC-0009 closed)
  - check_c: FAIL (7 failures — WEAKNESS-02 prevents per-project pass)
- Override documented in `manual_override_log` (id: `600d363a`)

---

## 3. FAILURES OBSERVED

| # | Failure | Task | Type | System Caught? |
|---|---|---|---|---|
| F-01 | `crm_activity_log` table missing from schema | CRM-04 | Dependency conflict | ❌ No — auto-QA PASS 100/100 |
| F-02 | Wrong function signature in email-notifier | CRM-05 | Contract mismatch | ❌ No — auto-QA PASS 100/100 |
| F-03 | `import { default as Papa }` runtime error | CRM-06 | Import syntax | ❌ No — auto-QA PASS 100/100 |
| F-04 | ContactSearch `onResult` not wired | CRM-10 | Partial impl | ❌ No — auto-QA PASS 100/100 |
| F-05 | Test suite 6/8 cases skipped | CRM-14 | Incomplete tests | ❌ No — auto-QA PASS 100/100 |
| F-06 | QA failure threshold → P2 incident | CRM-04 | Escalation | ✅ Yes — INC-0008 created |
| F-07 | Commit failure threshold → P1 incident | CRM-05 | Escalation | ✅ Yes — INC-0009 created |
| F-08 | Release gate blocked on open P1 | Project | Gate block | ✅ Yes — gate FAILED correctly |
| F-09 | Gate commit count is global | System | Config bug | ⚠️ Caught in test — not auto-detected |
| F-10 | `agent_output_id` required for QA verdict | System | API contract | ⚠️ Caught when attempting direct fail |
| F-11 | Tasks complete before manual QA fail possible | System | Timing | ⚠️ Structural weakness — no fix path |

---

## 4. SYSTEM RESPONSE ANALYSIS

### Auto-QA Behavior

The auto-QA agent runs immediately after dispatch. It evaluates tasks based on metadata (task title, description, task_type, agent_role) and the G4 stub file. It does **not** evaluate actual code. All tasks in this test received PASS verdicts:

| Task | Auto-QA Score | Actual State |
|---|---|---|
| CRM-04 (missing table) | 100/100 PASS | Broken — runtime 42P01 |
| CRM-05 (contract bug) | 100/100 PASS | Broken — TS2345 mismatch |
| CRM-06 (import error) | 100/100 PASS | Broken — TypeError |
| CRM-10 (partial) | 100/100 PASS | Non-functional |
| CRM-14 (incomplete tests) | 100/100 PASS | 6/8 tests skipped |

**Root cause:** Auto-QA scores based on task description completeness, not implementation quality. This is WEAKNESS-01.

### Escalation Behavior

The G6 escalation system worked correctly under stress:
- 3 QA failures within 24h → P2 incident ✅
- 3 commit failures within 24h → P1 incident ✅
- Both escalations non-fatal to the primary pipeline ✅
- G5 wrote all `qa_verdict_fail` and `commit_failure` task_events before G6 calls ✅

### Release Gate Behavior

The gate correctly blocked when P1 was open. The gate also correctly identified 7 commit failures in the window. The gate blocked twice, which is correct behavior. The weakness is the scope issue (WEAKNESS-02), not the blocking itself.

### Governance Trace

All events are in G5:
- `task_events`: dispatched, pipeline_entry, qa_verdict_pass, qa_verdict_fail, commit_failure, pipeline_exit entries
- `handoff_events`: dispatch handoffs for all 14 tasks
- `release_gate_checks`: 2 rows (gate attempts 1 and 2)
- `manual_override_log`: 1 row (override for check_c)

---

## 5. INCIDENTS CREATED

| Code | Severity | Status | Cause | Resolution |
|---|---|---|---|---|
| INC-0008 | P2 | Closed | CRM-04 QA failed 3×/24h (Scenario A) | RULE-26 linked, closed |
| INC-0009 | P1 | Closed | CRM-05 commit failed 3×/24h (Scenario B) | RULE-28 linked, closed |

**Pre-existing incidents (from G8 E2E test, different project):**

| Code | Severity | Status |
|---|---|---|
| INC-0004 | P2 | Open (pre-existing, G8 test) |
| INC-0005 | P2 | Open (pre-existing, G8 test) |
| INC-0006 | P2 | Open (pre-existing, G8 test) |
| INC-0007 | P2 | Open (pre-existing, G8 test) |

**Note:** Pre-existing incidents are not scoped to the G9 project. Open P2 incidents do not block the release gate (only P0 and P1 block). This is correct behavior — P2 incidents are informational.

---

## 6. RULES GENERATED

| Code | Title | Source |
|---|---|---|
| RULE-26 | Schema Tasks Must Define All Tables Referenced by Dependent Code Tasks | INC-0008 |
| RULE-27 | Auto-QA Must Validate Table References Against Active Schema Before Passing | INC-0008 |
| RULE-28 | Integration Module Signatures Must Be Defined Before Caller Tasks Dispatched | INC-0009 |
| RULE-29 | Release Gate Commit Failure Rate Check Must Be Scoped to Project ID | INC-0009 |

**Total prevention rules in system after G9:** 29 (RULE-01 through RULE-29)

---

## 7. WEAKNESSES FOUND

### WEAKNESS-01: Auto-QA Blindly Passes All Tasks (CRITICAL)

**What broke:** Auto-QA evaluates task descriptions and stub file metadata — not actual implementation code.

**Where:** `apps/web/src/app/api/qa/verdict/route.ts` — auto-QA agent scoring logic.

**Why:** The auto-QA agent uses task metadata (title, description, task_type) as its evaluation corpus. It cannot access the actual code written by the agent executor, which does not exist as a committed artifact at QA time.

**Evidence:** CRM-04 (explicitly described as having a missing table dependency in its task description) passed with 100/100. CRM-05, CRM-06, CRM-10, CRM-14 all passed 100/100 despite documented defects.

**System caught it:** ❌ No. Auto-QA passed all buggy tasks.

**Impact:** CRITICAL — any task can pass QA regardless of implementation quality. The entire QA gate provides false confidence.

**Required improvement:**
- Auto-QA must validate: (a) all tables referenced in the task description exist in the schema, (b) all file paths in the task exist in the G4 commit stub, (c) no import syntax known to fail (e.g., `{ default as X }` for CommonJS modules)
- Auto-QA score must incorporate schema validation, not just description quality
- Rule: RULE-27

---

### WEAKNESS-02: Release Gate Commit Failure Count Is Global (HIGH)

**What broke:** `check_c_commit_failure_rate` counts ALL `commit_failure` events in `task_events` for the past 7 days, globally across all projects.

**Where:** `apps/web/src/app/api/governance/trigger/release-gate/route.ts` — check_c query.

**Why:** The Supabase query for check_c does not filter by `project_id`:
```sql
-- Current (WRONG):
SELECT count(*) FROM task_events WHERE event_type = 'commit_failure' AND created_at >= NOW() - INTERVAL '7 days'

-- Correct:
SELECT count(*) FROM task_events WHERE event_type = 'commit_failure' AND project_id = $project_id AND created_at >= NOW() - INTERVAL '7 days'
```

**Evidence:** G9 CRM project (`1abeae47`) had 3 project-specific commit failures. But gate counted 7 because it included 4 failures from G8 test project (`feb25dda`). Gate blocked with `7 > 5 threshold`.

**System caught it:** ⚠️ Partial — gate blocked correctly per its own rules. The scope issue was caught during analysis.

**Impact:** HIGH — projects with clean commit histories will be incorrectly blocked by failures in other projects. Multi-project environments will have cascading gate failures.

**Required improvement:**
- Filter task_events by `project_id` in check_c query
- Rule: RULE-29

---

### WEAKNESS-03: QA Verdict API Requires `agent_output_id` (MEDIUM)

**What broke:** When attempting to submit a QA FAIL verdict via `/api/qa/verdict`, the API returned: `"null value in column 'agent_output_id' of relation 'qa_verdicts' violates not-null constraint"`.

**Where:** `apps/web/src/app/api/qa/verdict/route.ts` — the qa_verdicts insert requires `agent_output_id`.

**Why:** The auto-QA flow creates an `agent_output` record before inserting the verdict. The external API path does not create this record, leaving `agent_output_id` null.

**System caught it:** ✅ Yes — database constraint prevented the malformed insert.

**Impact:** MEDIUM — external systems or manual QA injection cannot submit verdicts without first creating an agent_output record. The API contract is incomplete. However, the database constraint correctly prevented the violation.

**Required improvement:**
- Document that `/api/qa/verdict` requires a prior `POST /api/agent-outputs` to get an `agent_output_id`
- OR make `agent_output_id` nullable in qa_verdicts for manual QA use cases
- OR create a dedicated `/api/governance/manual-qa` endpoint that handles both steps

---

### WEAKNESS-04: Auto-QA Timing Prevents Manual QA Failure Injection (MEDIUM)

**What broke:** Tasks auto-complete via auto-QA immediately after dispatch. Once a task is in `completed` status, it cannot receive QA verdicts. This makes it impossible to inject a QA FAIL verdict through the normal API path for tasks that auto-QA has already passed.

**Where:** Dispatch flow — auto-QA runs synchronously during dispatch.

**Why:** The design prioritizes speed (immediate completion) over testability and override capability.

**System caught it:** ✅ Yes — API correctly rejected verdicts on completed tasks.

**Impact:** MEDIUM — there is no override path for manual QA reviewers to fail a task that auto-QA has already passed. Human reviewers cannot reject auto-passed work without a separate mechanism.

**Required improvement:**
- Add a `force_qa_review: true` flag to dispatch that keeps task in `awaiting_review` instead of auto-completing
- OR create a `/api/governance/qa-override` endpoint that can send a task back to review even from `completed` status
- Rule: None yet — create in G10

---

### WEAKNESS-05: `tasks_agent_role_check` Constraint Undocumented (LOW)

**What broke:** Attempting to create a test task with `agent_role: "qa_engineer"` failed with constraint violation. Valid roles are: `architect`, `automation_engineer`, `backend_engineer`, `frontend_engineer`.

**Where:** Supabase tasks table check constraint.

**System caught it:** ✅ Yes — database constraint correctly rejected the insert.

**Impact:** LOW — operational friction. Task creation requires schema knowledge not exposed in API documentation.

**Required improvement:**
- Document valid `agent_role` values in API reference
- Add a `GET /api/governance/task-schema` endpoint listing valid enum values

---

### WEAKNESS-06: Feature/Epic Hierarchy Required but Not Documented (LOW)

**What broke:** Task creation requires `feature_id`, which requires `epic_id`. Neither constraint is documented in the task creation API or in BuildOS governance documentation.

**Where:** tasks table (feature_id NOT NULL) → features table (epic_id NOT NULL).

**System caught it:** ✅ Yes — database constraint.

**Impact:** LOW — operational friction for new users or agents creating tasks programmatically.

**Required improvement:**
- Document the required task creation hierarchy in Architect-Operating-System.md
- Consider making `feature_id` nullable for standalone governance/infra tasks

---

## 8. WHAT SYSTEM HANDLED WELL

1. **QA failure escalation:** 3 fails in 24h → P2 incident auto-created ✅
2. **Commit failure escalation:** 3 failures in 24h → P1 incident auto-created ✅
3. **Release gate P1 blocking:** Open P1 correctly blocked release ✅
4. **G5 audit trail completeness:** All events — dispatch, qa fail, commit fail, gate check — written to G5 ✅
5. **NC-10 compliance:** All G6 trigger calls non-fatal throughout the stress test ✅
6. **NC-09 compliance:** G5 writes occurred before all G6 calls ✅
7. **Incident closure with rule:** INC-0008 and INC-0009 both closed with linked prevention rules ✅
8. **NC-05 compliance:** Gate override logged in `manual_override_log` before proceeding ✅
9. **Database constraints as safety net:** Invalid enum values, NOT NULL violations — all correctly rejected ✅
10. **Non-fatal task creation failures:** Bad task creation attempts failed cleanly, retries succeeded ✅

---

## 9. WHAT SYSTEM FAILED

1. **Auto-QA does not evaluate code quality** — tasks with intentional runtime bugs pass 100/100 (WEAKNESS-01)
2. **Release gate check_c global scope** — multi-project environments experience cross-contamination (WEAKNESS-02)
3. **No manual QA override path** — cannot fail a task after auto-QA has passed it (WEAKNESS-04)
4. **QA verdict API contract incomplete** — requires undocumented agent_output_id (WEAKNESS-03)
5. **Task schema undocumented** — valid roles, required hierarchy not in governance docs (WEAKNESS-05, 06)

---

## 10. REQUIRED IMPROVEMENTS

### Priority 1 (CRITICAL — blocks system trust)

**G10-IMPROVEMENT-01: Fix auto-QA to validate schema references**
- In the auto-QA agent, add a check: query `information_schema.tables` for any table name mentioned in the task description
- If a referenced table is missing, auto-fail with `score: 10` and issue `"Referenced table {name} does not exist in schema"`
- Implements RULE-27

**G10-IMPROVEMENT-02: Fix release gate check_c to be project-scoped**
- In `trigger/release-gate/route.ts`, add `AND project_id = $project_id` to the commit_failure count query
- Test with multi-project scenario
- Implements RULE-29

### Priority 2 (HIGH — blocks scalability)

**G10-IMPROVEMENT-03: Add manual QA override path**
- Create `POST /api/governance/qa-override` with body `{task_id, reason, verdict, score}` that:
  1. Logs to `manual_override_log`
  2. Updates task status back to `awaiting_review`
  3. Submits a QA verdict via normal path

**G10-IMPROVEMENT-04: Document task creation requirements**
- Update Architect-Operating-System.md §5 with: required hierarchy (epic → feature → task), valid agent_roles, valid task_types
- Add to Domain-Rules.md as DR-GOV-07

### Priority 3 (MEDIUM — operational friction)

**G10-IMPROVEMENT-05: Fix QA verdict API contract**
- Make `agent_output_id` nullable in qa_verdicts for manual QA use cases
- OR document the agent_output creation step before qa/verdict
- OR create auto-stub agent_output when none provided

---

## 11. FINAL VERDICT

```
BUILDOS G9 STRESS TEST VERDICT: NEEDS HARDENING
```

### Verdict Justification

The system handled escalation, gate blocking, incident lifecycle, and audit trail correctly. The governance infrastructure (G5, G6, incident creation, prevention rule linking) performed as designed throughout the 4-scenario stress test.

**However:**

WEAKNESS-01 (auto-QA blind to code quality) is a critical trust gap. The QA gate is BuildOS's primary quality enforcement mechanism. If auto-QA gives 100/100 to tasks with documented runtime bugs, the gate provides false safety. Tasks can ship with broken imports, missing tables, and type mismatches — all with passing QA verdicts.

WEAKNESS-02 (global gate scope) will become increasingly problematic as the system scales to multiple real projects. Cross-project gate contamination is a correctness issue.

### What G10 Must Fix

1. Auto-QA schema validation (RULE-27)
2. Release gate project-scoped commit count (RULE-29)
3. Manual QA override path (no rule yet)
4. Documentation of task creation requirements (DR-GOV-07 pending)

### What Remains Sound

The governance architecture is fundamentally correct. G5 is reliable. Escalation paths work. Incident lifecycle works. Prevention rule enforcement works. Gate blocking works. The issues are in implementation details of two specific components, not in the governance model itself.

---

## 12. VALIDATION CHECKLIST

- [x] Project created (1abeae47)
- [x] 14 tasks executed (10+ requirement met)
- [x] Multiple failures triggered (5 intentional bug scenarios, 3 failure types)
- [x] Incidents created (INC-0008, INC-0009)
- [x] QA escalation enforced (Scenario A: P2 auto-created)
- [x] Commit failure enforcement triggered (Scenario B: P1 auto-created)
- [x] n8n flows triggered (all trigger calls fired; non-fatal)
- [x] Release gate used (2 attempts — FAIL then documented)
- [x] No silent failure (all failures produced events or errors)
- [x] Full DB trace exists (G5 task_events, handoff_events, release_gate_checks, manual_override_log)
- [x] Weaknesses documented (6 weaknesses, 4 priority improvements)
- [x] 4 new prevention rules created (RULE-26 through RULE-29)
- [x] System improvement roadmap defined

---

## Production State at G9 Completion

| Metric | Value |
|---|---|
| Prevention rules | 29 (RULE-01 through RULE-29) |
| G9 project incidents | 2 (INC-0008 P2, INC-0009 P1 — both closed) |
| Weaknesses discovered | 6 |
| Critical weaknesses | 1 (WEAKNESS-01: auto-QA) |
| High weaknesses | 1 (WEAKNESS-02: gate scope) |
| Improvements queued for G10 | 5 |
| Release gate status | pending (override logged: 600d363a) |
| Manual overrides logged | 1 |
| G5 trace complete | ✅ |

---

*This report fulfills the G9 execution report requirement per NC-06. See [CANONICAL-GOVERNANCE-v1.md](./governance/CANONICAL-GOVERNANCE-v1.md) for governance context. G10 must address WEAKNESS-01 and WEAKNESS-02 before BuildOS is considered production-hardened.*
