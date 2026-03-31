# BuildOS — Incident Protocol

**Version:** 1.0
**Block:** G2
**Created:** 2026-03-31
**Status:** ACTIVE
**Supersedes:** Ad-hoc bug tracking (pre-G2)

---

## 1. Purpose

This protocol defines the formal incident lifecycle for BuildOS. Every production defect, logic failure, data corruption, or system misbehavior must be tracked as a formal incident with a root cause analysis (RCA) and a verified fix before closure.

Incidents exist to prevent recurrence. An incident without an RCA is not closed. An RCA without a fix record is not closed. A fix without a linked prevention rule is not closed.

**Relationship to Prevention Rules Registry:** Every closed incident must produce or link one prevention rule in the Prevention Rules Registry (`docs/governance/Prevention-Rules-Registry.md`). This is the mechanism by which incidents become permanent system improvements.

---

## 2. Severity Model

| Severity | Name | Definition | Response SLA |
|----------|------|------------|--------------|
| **P0** | Critical | Total system failure, data loss, security breach, autonomous spend loop with no ceiling. Production is down or dangerous. | Immediate — fix before next task dispatch |
| **P1** | High | Partial system failure, core loop broken, task dispatch failing, retry logic broken. Multiple users or pipelines affected. | Same session — fix before block completion |
| **P2** | Medium | Degraded functionality, incorrect behavior, UI broken, non-critical API errors. Workaround exists. | Next block |
| **P3** | Low | Cosmetic issues, minor logic edge cases, documentation gaps, non-blocking warnings. | Backlog |

---

## 3. Incident Types

| Type | Description |
|------|-------------|
| `logic` | Incorrect algorithm, wrong conditional, off-by-one, bad state machine transition |
| `state` | Corrupted or inconsistent state in DB, cache, or runtime (e.g. tasks stuck in wrong status) |
| `contract` | API contract violation — wrong field name, unexpected null, schema mismatch between caller/callee |
| `ui` | Frontend rendering bug, missing component, broken layout, broken route |
| `infra` | Environment misconfiguration, missing env var, Vercel deploy failure, Supabase connectivity |
| `data` | Incorrect seed data, migration failure, missing rows, FK violation |
| `security` | Unauthorized access, exposed secrets, auth bypass, missing RLS |
| `performance` | Timeout, excessive DB queries, N+1, slow page load, budget ceiling miss |
| `workflow` | n8n pipeline failure, agent dispatch failure, commit pipeline skip, webhook routing error |

---

## 4. Incident Lifecycle

```
OPEN → [root cause added] → [fix added] → [prevention rule linked] → CLOSED
         at any point          at any point       required for close
```

States:
- `open` — Incident recorded, investigation in progress
- `investigating` — Active RCA underway
- `fix_in_progress` — Fix identified and being applied
- `closed` — All closure requirements met and verified

An incident may **never** move to `closed` unless all closure requirements (Section 6) are satisfied. The API enforces this and returns HTTP 422 if requirements are missing.

---

## 5. Ownership Rules

Every incident must have an `owner_domain`. Valid values:

| Domain | Responsible For |
|--------|----------------|
| `backend` | API routes, DB queries, execution logic, dispatch |
| `infra` | Vercel config, env vars, n8n webhooks, Supabase DDL |
| `frontend` | React components, Next.js pages, UI state |
| `qa` | QA verdicts, test coverage, eval accuracy |
| `architect` | Task structure, epic/feature seeding, sprint design |
| `security` | Auth, RLS, secret management |

The owner domain is accountable for the fix and the prevention rule.

---

## 6. Closure Requirements (MANDATORY — ALL SIX REQUIRED)

An incident **cannot be closed** unless ALL of the following exist:

| # | Requirement | Description |
|---|-------------|-------------|
| A | `severity` set | P0, P1, P2, or P3 must be specified |
| B | `incident_type` set | Must match one of the 9 valid types |
| C | `owner_domain` set | Must match one of the 6 valid domains |
| D | Root cause record | At least one `incident_root_causes` row for this incident |
| E | Fix record | At least one `incident_fixes` row for this incident |
| F | Prevention rule linked | `related_rule_id` must reference an existing `prevention_rules` row OR a new rule must be created and linked |

If any requirement is missing, the close API returns:
```json
{
  "error": "Incident cannot be closed: missing requirements",
  "missing": ["root_cause", "fix_record"],
  "enforcement": "Block G2"
}
```

---

## 7. RCA Required Fields

Every root cause record must contain:

| Field | Description |
|-------|-------------|
| `symptom` | What the system did wrong (observable behavior) |
| `trigger` | What action or condition caused the symptom to occur |
| `broken_assumption` | What design assumption turned out to be wrong |
| `missing_guardrail` | What safety check, validation, or test would have prevented this |
| `why_not_caught_earlier` | Why the existing test/review/QA process did not catch this |

---

## 8. Fix Required Fields

Every fix record must contain:

| Field | Description |
|-------|-------------|
| `fix_type` | `permanent`, `temporary`, `workaround`, or `mitigation` |
| `fix_description` | What was changed and why |
| `implementation_notes` | How it was implemented (file paths, functions, SQL) |
| `permanent_prevention_added` | Boolean — was a prevention rule created or linked? |

---

## 9. Incident Code Format

Every incident receives a human-readable, deterministic code:

```
INC-0001
INC-0002
INC-0003
```

Codes are generated at INSERT time using a sequence counter. They are unique, immutable, and used in all references, reports, and links to prevention rules.

---

## 10. Escalation Rules

| Condition | Action |
|-----------|--------|
| P0 with no fix in same session | Block all further task dispatch until resolved |
| P1 open for > 1 block | Escalate to architect review |
| Same `broken_assumption` appears in 2+ incidents | Trigger pattern review, create systemic prevention rule |
| P0/P1 with `permanent_prevention_added = false` | Fix record rejected — permanent prevention required for high-severity |

---

## 11. Relationship to Task System

- `related_task_id` links an incident to the specific task that caused or revealed it
- P0/P1 incidents on a task automatically set that task to `blocked` status if not already completed
- New tasks may be created from incident fix actions (type: `fix_task`)

---

## 12. Relationship to Prevention Rules Registry

- Every closed incident MUST link to a prevention rule via `related_rule_id`
- If no existing rule covers the incident, a new rule must be created in `prevention_rules` and linked
- The rule's `source_bug_id` field should reference the incident code (e.g., `INC-0001`)
- Rules derived from incidents are marked with `enforcement_type` appropriate to the fix layer

---

## 13. Relationship to Settings / Governance Updates

- P0 incidents trigger a mandatory governance review of the affected system layer
- Any incident with `incident_type = security` triggers immediate security policy review
- Closed incidents are surfaced in the admin governance dashboard at `/settings` (planned)
- Monthly incident summary is generated from closed incidents grouped by type and owner_domain
