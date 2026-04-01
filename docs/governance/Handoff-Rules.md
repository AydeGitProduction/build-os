# BuildOS — Handoff Rules

**Version:** 1.0
**Block:** G7 — Final Governance Lock
**Date:** 2026-04-01
**Status:** LOCKED
**Authority:** Derives from [System-Charter.md](./System-Charter.md) §10 (Governance Trace Requirement)

---

## Preamble

A handoff is the transfer of responsibility for a task between two agents, systems, or pipeline stages. Handoff rules ensure that when responsibility transfers, the receiving party has everything it needs and the transfer is durably recorded.

In BuildOS, the primary handoffs are:
- **Intake → Dispatch** (task enters the pipeline and is dispatched to an agent)
- **Dispatch → Agent** (agent receives the task and begins execution)
- **Agent → QA** (agent produces output, QA evaluates it)
- **QA → Completion** (task passes QA and is marked completed)
- **QA → Retry** (task fails QA and is returned for rework)
- **Task → Incident** (failure triggers a formal incident)

Every handoff must leave a durable trace in the G5 governance tables. A handoff with no trace is treated as if it did not occur.

See also: [System-Charter.md](./System-Charter.md) | [Architect-Operating-System.md](./Architect-Operating-System.md) | [Domain-Rules.md](./Domain-Rules.md) | [Settings-Changelog.md](./Settings-Changelog.md)

---

## 1. Required Fields for All Handoffs

Every handoff must carry the following minimum information:

| Field | Type | Required | Description |
|---|---|---|---|
| `task_id` | UUID | ✅ | The task being handed off |
| `from_agent` | text | ✅ | The role or system transferring responsibility (e.g., `orchestrator`, `code_generator`, `qa_security_auditor`) |
| `to_agent` | text | ✅ | The role or system receiving responsibility |
| `handoff_type` | text | ✅ | The type of handoff (see §2) |
| `timestamp` | timestamptz | ✅ | When the handoff occurred (auto-set by DB) |
| `project_id` | UUID | Recommended | The project the task belongs to |
| `payload_summary` | text | Recommended | Human-readable description of what is being transferred |

Optional enrichment fields:
| Field | Description |
|---|---|
| `notes` | Free text — any context the receiving agent needs |
| `prior_status` | The task's status before this handoff |
| `new_status` | The task's status after this handoff |

---

## 2. Handoff Types

| `handoff_type` | Description | From | To |
|---|---|---|---|
| `pipeline_entry` | Task enters the BuildOS pipeline | `intake` | `dispatch` |
| `dispatch` | Task is dispatched to an agent for execution | `orchestrator` | `<agent_role>` |
| `execution_complete` | Agent finishes execution and submits output | `<agent_role>` | `qa_security_auditor` |
| `qa_pass` | Task passes QA and is marked completed | `qa_security_auditor` | `completed` |
| `qa_fail_retry` | Task fails QA and is returned for rework | `qa_security_auditor` | `<original_agent_role>` |
| `escalation` | Task failure is escalated to an incident | `governance` | `incident_manager` |
| `manual_override` | A human overrides a system decision | `system` | `human` |
| `pipeline_exit` | Task exits the pipeline (completed or failed) | `pipeline` | `archive` |

---

## 3. Evidence Requirements

For each handoff type, the following evidence must be attached or referenced:

### 3.1 Pipeline Entry (`pipeline_entry`)
- Task exists in the `tasks` table with a valid `task_type`, `agent_role`, and `status = 'ready'`
- The task contract (description field) is non-empty and contains specific deliverables
- No blocking dependencies exist in `blocked` or `failed` status

### 3.2 Dispatch (`dispatch`)
- A `task_runs` row exists with `status = 'started'`
- A resource lock was successfully acquired
- The agent webhook URL was called (or mock mode was engaged in dev)
- A `task_events` row with `event_type = 'dispatched'` exists
- A `handoff_events` row with `handoff_type = 'dispatch'` exists

### 3.3 Execution Complete (`execution_complete`)
- An `agent_outputs` row exists with `task_id` matching the task and `is_valid = true`
- The agent output has a non-empty `content` field
- The task status has transitioned to `awaiting_review` or `in_qa`

### 3.4 QA Pass (`qa_pass`)
- A `qa_verdicts` row exists with `verdict = 'PASS'`
- The verdict row references a valid `agent_outputs.id`
- The task status is `completed`
- A `task_events` row with `event_type = 'qa_verdict_pass'` exists
- A G6 task-completed trigger was fired (non-fatal)

### 3.5 QA Fail / Retry (`qa_fail_retry`)
- A `qa_verdicts` row exists with `verdict = 'FAIL'`
- The verdict includes a non-empty `issues` array describing what failed
- The task's `retry_count` has been incremented
- A `task_events` row with `event_type = 'qa_verdict_fail'` exists
- A G6 qa-failed trigger was fired (non-fatal)
- If the fail count (24h) reaches 3: a P2 incident exists in the `incidents` table

### 3.6 Escalation (`escalation`)
- An `incidents` row exists with `related_task_id` referencing the task
- The incident has a valid `severity`, `incident_type`, `owner_domain`, and `title`
- A `task_events` row with `event_type = 'incident_linked'` exists
- A `settings_changes` row documents the escalation (created by the G6 incident-created trigger)

---

## 4. Dependency Status Requirements

A handoff must not proceed if any of the following are true:

- The task has unresolved dependencies with `status IN ('pending', 'in_progress', 'blocked', 'failed')` — except for the first task in a chain
- The task's `status` is not at the expected pre-handoff value (e.g., a task cannot be dispatched unless it is `ready`)
- A P0 incident is open for the same project — no dispatches may proceed until P0 is resolved
- The task has exceeded `max_retries` — the handoff becomes an escalation rather than a retry

---

## 5. Documentation Update Requirement

When a handoff reveals that the system does not match the documented expectation, documentation must be updated. Specifically:

- If a task produces an output that changes an API contract, the relevant protocol document must be updated as part of the same or immediately following task
- If a task reveals a gap in Domain Rules or Handoff Rules, a task must be created to update the relevant document
- If a handoff fails due to missing or incorrect information, the task contract template that produced the gap must be updated

Documentation updates are not optional. A task is not complete if its output left documentation in a contradictory state.

---

## 6. Contract Change Disclosure

If an agent's output changes an existing API contract (adds/removes fields, changes types, changes status codes), the change must be disclosed explicitly:

1. The agent output must include a note that a contract change occurred
2. The QA verdict for the task must evaluate whether the contract change is backward compatible
3. If the change is breaking: a new task must be created to update all callers
4. The `settings_changes` G5 table must have a row documenting the contract change

A contract change that is not disclosed is a violation of DR-API-02 and will be treated as a governance incident.

---

## 7. Escalation for Incomplete Handoffs

If a handoff is attempted but cannot proceed because required fields or evidence are missing:

1. The pipeline operation is rejected with an appropriate HTTP error code (400 or 422)
2. A `task_events` row is written with `event_type = 'handoff_rejected'` and `details` explaining what was missing
3. If the same handoff has been rejected 3 times, a P2 incident is created automatically
4. The task remains in its current status until the missing information is provided

A handoff that silently fails (the operation appears to succeed but the trace is missing) must be treated as an incident. Silent failures indicate a monitoring gap that must be fixed.

---

## 8. Relation to Governance Memory Tables

Every handoff type maps to one or more G5 governance table writes:

| Handoff Type | G5 Table | `event_type` / Notes |
|---|---|---|
| `pipeline_entry` | `task_events` | `event_type = 'pipeline_entry'` |
| `pipeline_entry` | `handoff_events` | `from_agent = 'intake'`, `to_agent = 'dispatch'` |
| `dispatch` | `task_events` | `event_type = 'dispatched'` |
| `dispatch` | `handoff_events` | `handoff_type = 'dispatch'` |
| `execution_complete` | `task_events` | `event_type = 'status_transition'` (via agent/output auto-hook) |
| `qa_pass` | `task_events` | `event_type = 'qa_verdict_pass'` |
| `qa_fail_retry` | `task_events` | `event_type = 'qa_verdict_fail'` |
| `escalation` | `task_events` | `event_type = 'escalation_triggered'` |
| `escalation` | `settings_changes` | Incident opened record (via G6 incident-created trigger) |
| `manual_override` | `manual_override_log` | Required for any human governance override |
| `pipeline_exit` | `task_events` | `event_type = 'pipeline_exit'` |

A handoff that does not produce the expected G5 rows must be investigated. Missing G5 rows indicate that the auto-hook or trigger route failed (see Domain Rules §6 for governance write requirements).

---

## 9. Handoff Validation at QA

The QA agent must verify the following handoff quality indicators for every task evaluation:

1. **Evidence completeness:** Does the agent output address all deliverables stated in the task contract?
2. **Contract compliance:** Does the output conform to the API or DB contract specified in the task?
3. **No silent failures:** Did the agent report any errors or did it silently skip parts of the task?
4. **File accuracy:** Were the correct files created/modified at the correct paths?
5. **No undisclosed side effects:** Did the agent change anything not specified in the task?

If any of these indicators is unsatisfied, the QA verdict must be `FAIL` with a non-empty `issues` array describing each gap.

---

## 10. Handoff Quality Score Interpretation

The `qa_verdicts.score` field (0-100) communicates the quality of the handoff from agent to QA:

| Score | Interpretation |
|---|---|
| 90-100 | Exemplary output. All deliverables met, no issues found. |
| 80-89 | Good output. Minor suggestions but no blocking issues. |
| 70-79 | Acceptable. Small corrections needed but fundamentally sound. |
| 60-69 | Below standard. Significant corrections required. FAIL. |
| 0-59 | Unacceptable. Fundamental gaps or errors. FAIL. |

A score of 69 or below produces a `FAIL` verdict. The `issues` array must always be populated for any FAIL verdict.

---

*This document is part of the BuildOS Governance Package v1. See [System-Charter.md](./System-Charter.md), [Architect-Operating-System.md](./Architect-Operating-System.md), [Domain-Rules.md](./Domain-Rules.md), and [Settings-Changelog.md](./Settings-Changelog.md) for the complete set.*
