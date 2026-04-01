# Governance Orchestration Protocol
## BuildOS Block G6 — n8n Enforcement Automation

**Block:** G6
**Date:** 2026-04-01
**Status:** ACTIVE
**Depends on:** G2 (Incidents), G3 (QA Gate), G5 (Governance Memory)

---

## 1. Purpose

Block G6 turns governance rules into **enforced automation**. Where G5 creates a durable audit trail and G2 tracks incidents, G6 closes the loop: governance events are not just recorded, they trigger automated responses via n8n workflows.

Without G6, governance is passive — a log that a human must read. With G6, governance is active — failures trigger escalation, thresholds trigger incidents, and release gates run automatically.

---

## 2. Architecture

### Push Model

BuildOS fires events to n8n via HTTP POST. n8n workflows process events, apply threshold logic, write back to G5 tables, and create incidents when thresholds are exceeded.

```
BuildOS pipeline event
  │
  ├─ G5 auto-hook (append-only log, non-fatal)
  │
  └─ G6 trigger route (non-fatal fire-and-forget)
        │
        ├─ Log event to G5 task_events
        ├─ Check escalation threshold (query G5 tables)
        ├─ Create incident if threshold exceeded (G2)
        └─ Fire n8n webhook (non-fatal)
              │
              n8n workflow:
              ├─ Validate + enrich event
              ├─ Apply automation logic
              ├─ POST back to BuildOS governance API (G5 log)
              └─ Return 200
```

### Escalation Threshold Logic

Escalation uses G5 `task_events` as the counter store. No separate escalation table needed — G5 is the single source of truth.

**QA failure escalation:** Count `task_events` where `event_type = 'qa_verdict_fail'` AND `task_id = $task_id` AND `created_at > NOW() - INTERVAL '24 hours'`. If count ≥ 3 → create G2 incident.

**Commit failure escalation:** Count `task_events` where `event_type = 'commit_failure'` AND `task_id = $task_id` AND `created_at > NOW() - INTERVAL '24 hours'`. If count ≥ 3 → create G2 incident.

---

## 3. The Six Governance Workflows

### 3.1 `task_created` — Task Enters Pipeline

**Trigger:** `POST /api/governance/trigger/task-created` — fired by `dispatch/task` route after task enters n8n.

**n8n webhook path:** `buildos-governance-task-created`

**Logic:**
1. Validate event payload (task_id, project_id, agent_role required)
2. Log to G5 `task_events` (event_type: `pipeline_entry`)
3. Log to G5 `handoff_events` (from: `orchestrator`, to: agent_role)
4. Return 200

**Purpose:** Creates a durable pipeline-entry record. Establishes the handoff chain for audit purposes.

---

### 3.2 `task_completed` — Task Reaches Terminal Success

**Trigger:** `POST /api/governance/trigger/task-completed` — fired by `qa/verdict` route when verdict=PASS and task transitions to `completed`.

**n8n webhook path:** `buildos-governance-task-completed`

**Logic:**
1. Validate event (task_id, project_id, final_status required)
2. Log to G5 `task_events` (event_type: `pipeline_exit`, details: {verdict: PASS, final_status: completed})
3. Check if all tasks in the feature are complete → if yes, log `feature_completed` event
4. Return 200

**Purpose:** Terminal success creates a clean audit exit. Required for feature-level governance tracking.

---

### 3.3 `qa_failed` — QA Verdict Failure (with Escalation)

**Trigger:** `POST /api/governance/trigger/qa-failed` — fired by `qa/verdict` route when verdict=FAIL or RETRY_REQUIRED.

**n8n webhook path:** `buildos-governance-qa-failed`

**Logic:**
1. Validate event (task_id required)
2. Log to G5 `task_events` (event_type: `qa_verdict_fail`)
3. **Escalation check:** Count `qa_verdict_fail` events for this `task_id` in last 24 hours
4. **If count ≥ 3 (QA_FAIL_ESCALATION_THRESHOLD):**
   - Create G2 incident (severity: P2, type: qa, owner: qa)
   - Log `escalation_triggered` event to G5
   - Transition task to `failed` (halt retries)
5. Return 200

**Escalation fields:**
- `incident_type: 'qa'`
- `severity: 'P2'`
- `owner_domain: 'qa'`
- `description: 'Task {task_id} failed QA {N} times in 24h — auto-escalated by G6'`
- `task_id`: linked task

---

### 3.4 `incident_created` — New Incident Opened

**Trigger:** `POST /api/governance/trigger/incident-created` — fired by `POST /api/governance/incidents` route after incident is created.

**n8n webhook path:** `buildos-governance-incident-created`

**Logic:**
1. Validate event (incident_id, severity, incident_type required)
2. Log to G5 `settings_changes` (setting_area: 'incidents', setting_key: incident_code, new_value: 'open', reason: auto-logged by G6)
3. For P0/P1 incidents: log urgency marker to G5 `task_events` on linked task (if any)
4. Return 200

**Purpose:** Every incident opening creates a G5 governance record linking the incident to any affected tasks.

---

### 3.5 `commit_failure` — Commit Verification Failed (with Escalation)

**Trigger:** `POST /api/governance/trigger/commit-failure` — fired when `commit_verified=false` in `commit_delivery_logs`, or when G4 stub gate fails.

**n8n webhook path:** `buildos-governance-commit-failure`

**Logic:**
1. Validate event (task_id, commit_sha or reason required)
2. Log to G5 `task_events` (event_type: `commit_failure`, details: {commit_sha, reason})
3. **Escalation check:** Count `commit_failure` events for this `task_id` in last 24 hours
4. **If count ≥ 3 (COMMIT_FAIL_ESCALATION_THRESHOLD):**
   - Create G2 incident (severity: P1, type: logic, owner: backend)
   - Log `escalation_triggered` event to G5
5. Return 200

**Escalation fields:**
- `incident_type: 'logic'`
- `severity: 'P1'` (commit failures are more severe than QA — they affect deliverability)
- `owner_domain: 'backend'`

---

### 3.6 `release_gate` — Release Readiness Check

**Trigger:** `POST /api/governance/trigger/release-gate` — manual trigger OR automated pre-deploy check.

**n8n webhook path:** `buildos-governance-release-gate`

**Logic:**
1. Validate event (project_id, gate_name required)
2. **Run readiness checks:**
   - Check A: No open P0/P1 incidents (query `incidents` table)
   - Check B: No tasks with `qa_verdict_fail` count ≥ 3 in last 7 days
   - Check C: No `commit_failure` count ≥ 5 in last 7 days
   - Check D: All required features have at least one `completed` task
3. **Determine gate_status:**
   - All checks pass → `passed`
   - Any critical check fails → `failed`
   - Non-blocking issue → `pending` (manual review required)
4. Write to G5 `release_gate_checks` with evidence_summary
5. Return gate_status + evidence_summary

**Gate checks are logged regardless of outcome** — every check leaves a durable trace.

---

## 4. Trigger Route Design

All trigger routes follow the same pattern:

```
POST /api/governance/trigger/{event-name}
Authorization: X-Buildos-Secret header required

Body: event payload (varies by route)

Response:
  202 Accepted — event accepted, processing async
  401 Unauthorized — missing/wrong secret
  400 Bad Request — missing required fields
```

All trigger routes are **non-blocking** from the caller's perspective:
- G5 log is synchronous (fast insert)
- Escalation check is synchronous (fast count query)
- n8n webhook fire is async (fire-and-forget, non-fatal)
- The route always returns before n8n finishes processing

---

## 5. n8n Workflow Files

| Workflow | File | n8n Webhook Path |
|----------|------|-----------------|
| Task Created | `n8n/buildos_governance_task_created.json` | `buildos-governance-task-created` |
| Task Completed | `n8n/buildos_governance_task_completed.json` | `buildos-governance-task-completed` |
| QA Failed | `n8n/buildos_governance_qa_failed.json` | `buildos-governance-qa-failed` |
| Incident Created | `n8n/buildos_governance_incident_created.json` | `buildos-governance-incident-created` |
| Commit Failure | `n8n/buildos_governance_commit_failure.json` | `buildos-governance-commit-failure` |
| Release Gate | `n8n/buildos_governance_release_gate.json` | `buildos-governance-release-gate` |

**Import instructions:** In n8n cloud, go to Workflows → Import → paste the JSON content of each file. Activate each workflow after import. Set n8n environment variables:
- `BUILDOS_BASE_URL`: `https://web-lake-one-88.vercel.app`
- `BUILDOS_SECRET`: (from `.env.local`)

**After import:** Update Vercel env vars with the actual n8n webhook URLs and redeploy.

---

## 6. Environment Variables

### New variables required (add to Vercel production + `.env.local`):

```
N8N_GOVERNANCE_TASK_CREATED_URL=https://bababrx.app.n8n.cloud/webhook/buildos-governance-task-created
N8N_GOVERNANCE_TASK_COMPLETED_URL=https://bababrx.app.n8n.cloud/webhook/buildos-governance-task-completed
N8N_GOVERNANCE_QA_FAILED_URL=https://bababrx.app.n8n.cloud/webhook/buildos-governance-qa-failed
N8N_GOVERNANCE_INCIDENT_CREATED_URL=https://bababrx.app.n8n.cloud/webhook/buildos-governance-incident-created
N8N_GOVERNANCE_COMMIT_FAILURE_URL=https://bababrx.app.n8n.cloud/webhook/buildos-governance-commit-failure
N8N_GOVERNANCE_RELEASE_GATE_URL=https://bababrx.app.n8n.cloud/webhook/buildos-governance-release-gate
```

**If any URL is not set:** The trigger route still runs (logs G5, checks escalation) but skips the n8n webhook call. Governance memory is preserved even without n8n connectivity.

---

## 7. Escalation Thresholds

| Event Type | Threshold | Window | Incident Severity |
|-----------|-----------|--------|------------------|
| qa_verdict_fail (per task) | 3 | 24 hours | P2 |
| commit_failure (per task) | 3 | 24 hours | P1 |
| Release gate check C | 5 commit_failures | 7 days | Manual review |

Thresholds are **per-task** to avoid false escalation when different tasks fail independently.

---

## 8. Failure Safety Rules

**RULE G6-1:** Governance triggers MUST NOT block the primary pipeline operation. All G6 trigger calls from existing routes use `try/catch` and fire non-fatally.

**RULE G6-2:** n8n webhook failures MUST NOT prevent G5 log writes. The G5 log write happens BEFORE the n8n call.

**RULE G6-3:** Escalation incident creation failures MUST be logged but MUST NOT prevent the primary trigger route from returning 202.

**RULE G6-4:** All 6 trigger routes return 202 Accepted (not 200 OK) to signal that processing happens asynchronously.

**RULE G6-5:** A trigger route that receives an event it can't process (missing fields) returns 400 immediately without partial processing.

---

## 9. Integration with G2 / G3 / G5

**G2 Integration:** G6 creates incidents via `POST /api/governance/incidents` with `auto_generated: true` flag. All auto-generated incidents require manual root_cause and fix records before closure (G2 closure requirements still apply).

**G3 Integration:** G6's `qa_failed` workflow uses G3 QA verdict data (score, issues) in its escalation logic. The `qa_failed` trigger is fired by G3 pipeline results in `qa/verdict/route.ts`.

**G5 Integration:** All G6 workflows write to G5 tables (task_events, release_gate_checks, settings_changes). G6 uses G5 as the escalation counter store (no separate counter table needed).

---

## 10. Known Limitations

1. **n8n webhook latency:** n8n workflows run async. There is typically a 1–5 second delay between BuildOS firing the trigger and n8n completing its logic. G5 logs are synchronous; n8n back-writes to G5 may appear slightly after the trigger route returns.

2. **n8n cloud requires workflow activation:** Workflows imported as JSON are inactive by default. Each must be manually activated in the n8n dashboard before webhooks respond.

3. **No n8n retry for failed webhook calls:** If the n8n cloud instance is down when BuildOS fires a governance event, the n8n call is silently dropped. G5 logging is unaffected. Future improvement: add a queue or retry mechanism.

4. **Escalation threshold is eventually consistent:** The count query reads from G5 in real time, but if two concurrent QA failures arrive within milliseconds of each other, both might read a count below threshold and neither creates an incident. This is acceptable for governance purposes — the next failure will trigger.
