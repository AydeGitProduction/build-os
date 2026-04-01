# BuildOS — Governance Memory Protocol

**Version:** 1.0
**Block:** G5
**Created:** 2026-04-01
**Status:** ACTIVE

---

## 1. Purpose

Governance memory is the durable record of every decision, transition, override, and check that affects the build pipeline. It is distinct from operational state (which task is running right now) and from output artifacts (what the agent produced).

**Mandatory principle:** If a governance-relevant action happens and leaves no durable trace, the system is incomplete. Governance memory is the audit trail that proves what happened, who decided it, and why.

---

## 2. Operational State vs. Governance Memory

| Concept | Location | Purpose | Retention |
|---------|----------|---------|-----------|
| Task status (`tasks.status`) | `tasks` table | Current runtime state | Mutable — changes with each transition |
| Agent output (`agent_outputs`) | `agent_outputs` table | What the agent produced | Immutable after write |
| **Governance memory** | `task_events`, `handoff_events`, `settings_changes`, `release_gate_checks`, `manual_override_log` | **Why and how things changed** | **Immutable — append-only** |

Operational state answers "what is happening now." Governance memory answers "what happened, when, who did it, and why."

---

## 3. What Governance Data Must Always Be Persisted

### Mandatory Events

| Event | Table | Trigger |
|-------|-------|---------|
| Task status transition | `task_events` | Every status change (dispatched → in_progress → awaiting_review → completed/blocked) |
| QA verdict issued | `task_events` | Every pass/fail verdict from qa/verdict route |
| Task dispatched | `task_events` + `handoff_events` | Every dispatch — records orchestrator → agent handoff |
| Settings change | `settings_changes` | Any change to QA thresholds, routing rules, retry limits, autopilot config |
| Manual override | `manual_override_log` | Any forced block, forced close, manual status reset |
| Release gate check | `release_gate_checks` | Any pre-release or pre-deploy gate evaluation |
| Incident closure | `task_events` (indirectly via `incidents` table) | Closure of P0/P1 incidents |

### Optional but Recommended

- Stub creation events (currently logged to `commit_delivery_logs`)
- Token refresh events (currently logged to `commit_delivery_logs`)
- Orchestration tick results
- Cost ceiling breaches

---

## 4. Governance Tables

### 4.1 `task_events`
Tracks every significant state change or governance-relevant action on a task.

```sql
CREATE TABLE task_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL,
  project_id  uuid,
  event_type  text NOT NULL CHECK (event_type <> ''),
  actor_type  text NOT NULL,
  actor_id    text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

`event_type` values: `dispatched`, `status_transition`, `qa_verdict_pass`, `qa_verdict_fail`, `manually_blocked`, `manually_closed`, `retry_triggered`, `dependency_unlocked`

### 4.2 `handoff_events`
Tracks role-to-role handoffs in the pipeline.

```sql
CREATE TABLE handoff_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL,
  from_role     text NOT NULL CHECK (from_role <> ''),
  to_role       text NOT NULL CHECK (to_role <> ''),
  handoff_type  text NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

`handoff_type` values: `dispatch`, `qa_review`, `rework`, `escalation`, `completion`

### 4.3 `settings_changes`
Immutable log of every setting that changed, with reason and actor.

```sql
CREATE TABLE settings_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_area    text NOT NULL,
  setting_key     text NOT NULL,
  previous_value  text,
  new_value       text,
  reason          text NOT NULL CHECK (reason <> ''),
  changed_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

`setting_area` examples: `qa`, `routing`, `orchestration`, `dispatch`, `autopilot`, `governance`

### 4.4 `release_gate_checks`
Records every release readiness check, pass or fail.

```sql
CREATE TABLE release_gate_checks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid,
  gate_name        text NOT NULL CHECK (gate_name <> ''),
  gate_status      text NOT NULL CHECK (gate_status IN ('passed','failed','skipped','pending')),
  evidence_summary text,
  checked_by       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

`gate_name` examples: `all_tasks_complete`, `no_open_p0_incidents`, `qa_pass_rate_threshold`, `commit_verified`, `security_scan`

### 4.5 `manual_override_log`
Records every manual intervention in the autonomous pipeline.

```sql
CREATE TABLE manual_override_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_type       text NOT NULL,
  target_entity_type  text NOT NULL,
  target_entity_id    text NOT NULL,
  reason              text NOT NULL CHECK (reason <> ''),
  performed_by        text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

`override_type` values: `force_block`, `force_complete`, `force_reset`, `status_override`, `lock_release`, `incident_close_override`

---

## 5. Retention Expectations

All governance tables are **append-only**. No row may be deleted or updated after insert. Governance memory is permanent.

| Table | Retention | Reason |
|-------|-----------|--------|
| `task_events` | Permanent | Audit trail |
| `handoff_events` | Permanent | Pipeline traceability |
| `settings_changes` | Permanent | Compliance, rollback reference |
| `release_gate_checks` | Permanent | Release history |
| `manual_override_log` | Permanent | Accountability |

---

## 6. Ownership

| Table | Owner Domain | Who Writes |
|-------|-------------|-----------|
| `task_events` | backend | dispatch/task, agent/output, qa/verdict (auto-hooks) |
| `handoff_events` | backend | dispatch/task (auto-hook), manual via API |
| `settings_changes` | architect | Manual via API or governance tooling |
| `release_gate_checks` | architect | Release process tooling, manual via API |
| `manual_override_log` | backend + architect | Any forced action path, manual via API |

---

## 7. Relationship to Incidents

Every P0/P1 incident in the `incidents` table is reflected in governance memory:
- When an incident is created: a `task_events` row with `event_type='incident_created'` is written
- When an incident is closed: a `settings_changes` row documents any resulting configuration changes
- Every incident must produce a prevention rule (per `Incident-Protocol.md`), which is itself governance memory

---

## 8. Relationship to Prevention Rules

Prevention rules (`prevention_rules` table) are part of governance memory. When a new rule is added:
- A `settings_changes` row records the addition with area=`governance`, key=`rule_<RULE-XX>`, reason = the incident that triggered it

---

## 9. Relationship to QA Results

QA results (`qa_verdicts` table) feed into `task_events` automatically. Every verdict triggers:
- A `task_events` row with `event_type='qa_verdict_pass'` or `'qa_verdict_fail'`
- The `details` field includes score, issues, and new task status

This creates a complete audit trail: task dispatched → agent ran → QA evaluated → verdict recorded → task closed.

---

## 10. Relationship to Settings Changes

Any change to system behaviour must produce a `settings_changes` row:
- Changing QA verdict threshold
- Enabling/disabling autopilot
- Changing routing model assignment
- Modifying retry limits
- Enabling/disabling shadow mode

Settings changes without a `reason` field are rejected at the API layer.

---

## 11. Relationship to Release Decisions

Before any release or production deployment that affects the autonomous pipeline:
- A `release_gate_checks` row must be created per gate evaluated
- Minimum gates: `all_tasks_complete`, `no_open_p0_incidents`, `commit_verified`
- A release with any gate in `failed` state must not proceed without a `manual_override_log` entry

---

## 12. Query and Audit Expectations

All governance tables are queryable via their GET API endpoints. Standard filters:
- `task_id` — for task-scoped queries
- `project_id` — for project-scoped queries
- `event_type` — for `task_events`
- `setting_area` + `setting_key` — for `settings_changes`
- `gate_status` — for `release_gate_checks`
- `limit` — all endpoints support up to 500 rows

Any internal audit should be able to reconstruct the complete history of any task's life from dispatch to completion using `task_events` + `handoff_events` alone.

---

## 13. Implementation Reference

| Module | Path | Responsibility |
|--------|------|---------------|
| `migrate-g5/route.ts` | `api/governance/` | DDL: 5 governance memory tables |
| `task-events/route.ts` | `api/governance/` | GET + POST task events |
| `handoffs/route.ts` | `api/governance/` | GET + POST handoff events |
| `settings-changes/route.ts` | `api/governance/` | GET + POST settings changes |
| `release-gates/route.ts` | `api/governance/` | GET + POST release gate checks |
| `manual-overrides/route.ts` | `api/governance/` | GET + POST manual override log |
| `agent/output/route.ts` | `api/agent/` | Auto-hook: task_events on status transition |
| `qa/verdict/route.ts` | `api/qa/` | Auto-hook: task_events on QA verdict |
| `dispatch/task/route.ts` | `api/dispatch/` | Auto-hook: task_events + handoff_events on dispatch |
