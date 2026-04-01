# BuildOS — Canonical Governance v1

**Version:** 1.0
**Block:** G8 — System Hardening + Final Validation
**Date:** 2026-04-01
**Status:** LOCKED — Governance v1 Frozen
**Authority:** Derives from [System-Charter.md](./System-Charter.md)

---

## Preamble

This document is the single canonical reference for BuildOS Governance v1. It links every governance document, describes the system architecture, establishes the source of truth hierarchy, and defines how governance evolves. It is read-only from the moment of G8 lock. Future changes must go through the formal governance evolution process defined in §7.

Any question about how BuildOS governs itself begins here.

---

## 1. Governance Document Index (G1–G7 + G8)

### Constitutional Layer (G7)

| Document | Location | Status | Purpose |
|---|---|---|---|
| **System Charter** | `docs/governance/System-Charter.md` | LOCKED | Constitutional law. What BuildOS is, is not, and must not claim. 10 non-negotiable constraints. |
| **Architect Operating System** | `docs/governance/Architect-Operating-System.md` | LOCKED | How the Architect handles new features, modules, incidents, and documentation. |
| **Domain Rules** | `docs/governance/Domain-Rules.md` | LOCKED | 40+ hard technical rules across DB, API, UI, QA, Commit, Governance, Auth, Migrations, Env Vars. |
| **Handoff Rules** | `docs/governance/Handoff-Rules.md` | LOCKED | How responsibility transfers between agents, pipeline stages, and systems. Evidence requirements per handoff type. |
| **Settings Changelog** | `docs/governance/Settings-Changelog.md` | ACTIVE (append-only) | Human-readable record of every governance decision, milestone, and configuration change. |

### Protocol Layer (G1–G6)

| Protocol | Location | Status | Purpose |
|---|---|---|---|
| **Prevention Rules Registry (G1)** | `docs/governance/Prevention-Rules-Registry.md` | ACTIVE | 25 rules derived from production incidents. Permanent institutional memory. |
| **Incident Protocol (G2)** | `docs/governance/Incident-Protocol.md` | ACTIVE | P0–P3 severity model, lifecycle (open → in_progress → closed), prevention rule requirement. |
| **QA Gate Protocol (G3)** | `docs/governance/QA-Gate-Protocol.md` | ACTIVE | Auto-QA agent, verdict schema (PASS/FAIL), score thresholds, retry logic. |
| **Commit Reliability Protocol (G4)** | `docs/governance/Commit-Reliability-Protocol.md` | ACTIVE | GitHub stub gate before dispatch, commit_delivery_logs, G4→G6 auto-escalation. |
| **Governance Memory Protocol (G5)** | `docs/governance/Governance-Memory-Protocol.md` | ACTIVE | 5 append-only audit tables, auto-hooks in dispatch/qa/agent routes. |
| **Governance Orchestration Protocol (G6)** | `docs/governance/Governance-Orchestration-Protocol.md` | ACTIVE | 6 n8n workflows, 6 trigger routes, automated escalation and event notification. |

### Canonical Reference (G8)

| Document | Location | Status | Purpose |
|---|---|---|---|
| **This Document** | `docs/governance/CANONICAL-GOVERNANCE-v1.md` | LOCKED | Single reference for Governance v1 architecture, hierarchy, and evolution. |
| **Architect Bootstrap Prompt** | `docs/governance/ARCHITECT-BOOTSTRAP-PROMPT.md` | ACTIVE | Onboarding guide for new AI agents entering the BuildOS system. |

---

## 2. System Architecture Overview — Governance Layers

BuildOS governance operates in six layers. Each layer depends on the layers below it. No layer can be bypassed.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 6: ORCHESTRATION (G6)                                    │
│  n8n workflows receive events from BuildOS trigger routes.      │
│  Automated escalation, notifications, release gating.          │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 5: MEMORY (G5)                                           │
│  5 append-only governance tables in Supabase.                   │
│  Every governance-relevant action leaves a durable trace.       │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4: COMMIT RELIABILITY (G4)                               │
│  Stub gate registers files in GitHub before agent dispatch.     │
│  Auto-escalates to G6 on failure.                              │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: QA GATE (G3)                                          │
│  Auto-QA evaluates every agent output.                          │
│  Tasks cannot complete without PASS verdict (score ≥ 70).      │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: INCIDENT PROTOCOL (G2)                                │
│  Formal P0–P3 incident management.                              │
│  Every incident requires a linked prevention rule to close.     │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 1: PREVENTION RULES (G1)                                 │
│  Permanent registry of lessons from production failures.        │
│  25 rules as of Governance v1 freeze (RULE-01 through RULE-25). │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Task Through the Governance Stack

```
Human/Architect writes task contract
         │
         ▼
[DISPATCH] /api/dispatch/task
  - G4: Stub gate pushes placeholder to GitHub
  - G4→G6: Auto-fires commit-failure trigger if stub fails
  - G5: Writes task_events (dispatched) + handoff_events (dispatch)
  - G6: Fires trigger/task-created → n8n notified
         │
         ▼
[AGENT EXECUTION] Claude API (via n8n or inline executor)
  - Agent receives task contract
  - Agent produces output
         │
         ▼
[QA VERDICT] /api/qa/verdict
  - Auto-QA evaluates output (score 0–100)
  - G5: Writes qa_verdicts + task_events (qa_verdict_pass or qa_verdict_fail)
  - If FAIL: G6 fires trigger/qa-failed → escalates at 3×/24h
  - If PASS: G6 fires trigger/task-completed → n8n notified
         │
         ▼
[TASK COMPLETE] status = 'completed'
  - G5: task_events row proves completion
  - Orchestration tick unlocks dependent tasks
         │
         ▼
[RELEASE GATE] /api/governance/trigger/release-gate
  - Check A: 0 open P0 incidents
  - Check B: 0 open P1 incidents
  - Check C: commit failures (7d) < 5
  - G5: Writes release_gate_checks row
  - G6: Fires n8n notification
```

---

## 3. Source of Truth Hierarchy

When a question about system behavior arises, consult sources in this order:

1. **Production database state** (Supabase, project ref: `zyvpoyxdxedcugtdrluc`) — the ultimate source of truth. The database is not wrong.
2. **G5 governance tables** — append-only audit trail: `task_events`, `handoff_events`, `settings_changes`, `release_gate_checks`, `manual_override_log`
3. **Execution reports** (G1–G8 series, P9-series, P11-series, ERT-series) — document what was built and when
4. **API route source code** — defines what the system does at `apps/web/src/app/api/`
5. **This governance package** — defines what the system must do
6. **n8n workflow JSON files** — defines automation behavior at `n8n/`

Documents that contradict production database state are wrong. No document, execution report, or chat message overrides what is actually in the database.

A feature is not real unless:
- Code is committed to `main` branch of `AydeGitProduction/build-os`
- Vercel deployment for that commit has reached state `READY`
- Feature returns expected response from `https://web-lake-one-88.vercel.app`
- At least one durable row exists in a G5 table proving the feature was exercised

---

## 4. How Governance Evolves

Governance v1 is frozen. Future changes follow this process:

### Step 1: Incident
A production failure occurs. The system auto-creates an incident (P2/P3) or a human creates it (P0/P1). The incident is logged in the `incidents` table with a code (INC-XXXX).

### Step 2: Rule
The incident is investigated. A root cause is identified. A prevention rule is written (RULE-XX format) and inserted into the `prevention_rules` table via `/api/governance/prevention-rules`. The rule is linked to the incident via `related_rule_id`.

### Step 3: Changelog
A new entry is added to `docs/governance/Settings-Changelog.md` documenting:
- What changed
- Why (the incident that triggered it)
- What the prior state was
- Which block/phase the change belongs to

### Step 4: Governance Block
If the change is significant (modifies a constitutional document, adds a new layer, changes a non-negotiable constraint), a new governance block is executed (G9, G10, etc.) with a full execution report committed to the repository.

### Step 5: Commit + Deploy
All changes are committed to `main` and deployed via Vercel. The governance block is not complete until its execution report is committed.

**No informal changes.** Chat messages, PR comments, and verbal agreements do not modify governance documents. The minimum change unit is: incident → rule → changelog entry → commit.

---

## 5. How New Rules Are Added

Prevention rules are the primary mechanism for encoding lessons from production.

### When to Add a Rule

A new rule must be added when:
- A production incident is closed (required before closure)
- A QA failure reveals a pattern not covered by existing rules
- An architectural decision is made that must constrain all future code
- A domain rule gap is identified during task review

### How to Add a Rule

1. Identify the next available `RULE-XX` code (query `prevention_rules` table for `max(rule_code)`)
2. POST to `/api/governance/prevention-rules` with:
   - `rule_code`: `RULE-XX` format
   - `title`: 10–15 word description of the rule
   - `description`: Full explanation of what must be prevented and why
   - `trigger_condition`: When this rule applies (specific technical condition)
   - `enforcement_type`: `code` | `infra` | `n8n` | `architect` | `qa`
   - `owner_domain`: `backend` | `frontend` | `db` | `infra` | `qa` | `governance`
   - `source_bug_id`: The incident code that produced this rule (e.g., `INC-0003`)
   - `example`: Concrete example of violation and correct behavior
3. Link the rule to its source incident via PATCH on `incidents.related_rule_id`
4. Add an entry to `Settings-Changelog.md`

---

## 6. How Incidents Feed Rules

The incident-to-rule pipeline is the core learning loop of BuildOS:

```
Production failure
    │
    ▼
Incident created (auto or manual)
INC-XXXX stored in incidents table
    │
    ▼
Root cause investigation
(human or Architect reviews failure)
    │
    ▼
Prevention rule written
RULE-XX stored in prevention_rules table
    │
    ▼
Incident closed with rule linked
incidents.related_rule_id = prevention_rules.id
    │
    ▼
Future task instructions reference the rule
(Architect injects relevant rules into task contracts)
    │
    ▼
QA verifies rule compliance in future tasks
(QA agent checks for violations during evaluation)
```

**Key constraint (NC-02):** An incident cannot be closed without a linked prevention rule or fix record. This is enforced at the database level via check constraint.

---

## 7. How n8n Enforces Rules

n8n is the automated enforcement layer. It receives events from BuildOS trigger routes and executes governance actions.

### Six Workflows

| Workflow | File | Trigger | Action |
|---|---|---|---|
| `buildos_governance_task_created` | `n8n/buildos_governance_task_created.json` | `/api/governance/trigger/task-created` | Logs pipeline entry, notifies stakeholders |
| `buildos_governance_task_completed` | `n8n/buildos_governance_task_completed.json` | `/api/governance/trigger/task-completed` | Logs pipeline exit, updates dashboards |
| `buildos_governance_qa_failed` | `n8n/buildos_governance_qa_failed.json` | `/api/governance/trigger/qa-failed` | Tracks QA failures; auto-creates P2 incident at 3×/24h |
| `buildos_governance_commit_failure` | `n8n/buildos_governance_commit_failure.json` | `/api/governance/trigger/commit-failure` | Tracks commit failures; auto-creates P1 incident at 3×/24h |
| `buildos_governance_incident_created` | `n8n/buildos_governance_incident_created.json` | `/api/governance/trigger/incident-created` | Notifies on-call, logs to settings_changes |
| `buildos_governance_release_gate` | `n8n/buildos_governance_release_gate.json` | `/api/governance/trigger/release-gate` | Runs 3-check gate; blocks or approves release |

### Enforcement Model

n8n does not write code or make decisions. It enforces rules by:
- **Counting**: QA failures, commit failures, retry counts in 24h windows
- **Escalating**: Auto-creating incidents when thresholds are exceeded
- **Notifying**: Alerting stakeholders when governance events occur
- **Gating**: Blocking releases when gate checks fail

### Critical Rules for n8n Integration

- **RULE G6-1**: All G6 trigger calls are non-fatal to the primary pipeline operation
- **RULE G6-2**: G5 write occurs BEFORE the n8n call (audit trail is not dependent on n8n)
- n8n webhook URLs are stored in Vercel env vars (`N8N_GOVERNANCE_*_URL`)
- If n8n is unreachable, BuildOS continues operating; the audit trail is preserved in G5 tables

---

## 8. How QA, Commit, and Memory Interact

The three operational layers (QA, Commit, Memory) form an interlocked system:

### QA → Memory → n8n

Every QA verdict produces:
1. A `qa_verdicts` row (primary verdict record)
2. A `task_events` row with `event_type = 'qa_verdict_pass'` or `'qa_verdict_fail'` (G5 memory)
3. A G6 trigger call: `trigger/task-completed` (PASS) or `trigger/qa-failed` (FAIL)

The G5 write happens first (RULE G6-2). If n8n is unavailable, the verdict is still recorded.

### Commit → Memory → QA

Every G4 stub gate operation:
1. Creates a placeholder file in GitHub (records intent before execution)
2. Logs the commit intent in `commit_delivery_logs`
3. If it fails: auto-fires `trigger/commit-failure` → G5 writes `task_events(commit_failure)` → if 3×/24h, creates P1 incident

### Memory as the Arbitrator

G5 tables are the final word on what happened:
- A task event without a `task_events` row did not happen (for governance purposes)
- A QA pass without a `qa_verdicts` row did not happen
- A release gate check without a `release_gate_checks` row did not happen
- An incident without a closed `incidents` row with `related_rule_id` cannot be treated as resolved

The memory layer does not block operations (writes are non-fatal), but missing memory rows are treated as governance incidents themselves.

---

## 9. Production State as of G8 Lock (2026-04-01)

### Verified Production Facts

| Metric | Value | Verified Via |
|---|---|---|
| Tasks completed through pipeline | 293+ | production_audit_2026-03-31 |
| Prevention rules in DB | 25 (RULE-01 through RULE-25) | `prevention_rules` table |
| G5 governance tables active | 5 | Supabase DB + G5 activation report |
| n8n workflow JSON files | 6 | `n8n/` directory |
| G6 trigger routes deployed | 6 | Vercel deployment, verified via curl |
| Open P0 incidents | 0 | release_gate check_a (2026-04-01) |
| Open P1 incidents | 0 | release_gate check_b (2026-04-01) |
| Commit failures (7d) | 3 | release_gate check_c (2026-04-01) |
| Release gate status | **PASSED** (gate_check_id: 06d88cd3) | `/api/governance/trigger/release-gate` |

### G8 E2E Test Results

| Step | Action | Result |
|---|---|---|
| 1 | Create project | PASS (project feb25dda) |
| 2 | Run wizard | PASS |
| 3 | Generate tasks | PASS (30+ tasks in project) |
| 4 | Execute task | PASS (task dispatched, G5 written) |
| 5 | Trigger QA | PASS (qa_verdict_pass recorded) |
| 6 | Perform commit | PASS (G4 stub gate active) |
| 7 | Simulate failure (QA fail ×3) | PASS (P2 incidents INC-0005, INC-0006, INC-0007 created) |
| 8 | System auto-response | PASS (n8n triggered, incidents created, G5 logged) |
| 7b | Simulate failure (commit fail ×3) | PASS (P1 incident INC-0003 auto-created) |
| 9 | Fix issue (RULE-25 + close P1) | PASS (RULE-25 created, INC-0003 closed with rule linked) |
| 10 | Retry execution | PASS (new task dispatched successfully) |
| 11 | Release gate | **PASS** (0 P0, 0 P1, 3 commit failures < 5) |

---

## 10. Non-Negotiable Constraints Reference

The 10 non-negotiable constraints from System-Charter.md §9. These cannot be waived by any person, protocol, or automation:

| ID | Constraint | Enforcement |
|---|---|---|
| NC-01 | No DDL via pg.Client or node-postgres | RULE-09, code review |
| NC-02 | No incident closure without linked prevention rule or fix record | DB check constraint |
| NC-03 | Governance writes must be non-fatal to callers | Code pattern (try/catch in all G5 hooks) |
| NC-04 | No task is "complete" without a QA verdict of PASS | `qa_verdicts` FK + status guard |
| NC-05 | No release through a failed gate without human override logged | `manual_override_log` requirement |
| NC-06 | Every governance block must produce an execution report committed to repo | G7 constitutional requirement |
| NC-07 | Sensitive env vars must not target development in Vercel production | Vercel config review |
| NC-08 | No silent fallback in routing — every routing event must be in `routing_decisions` | ERT-P6C code enforcement |
| NC-09 | G5 writes must occur before n8n calls | RULE G6-2, code order in all routes |
| NC-10 | All G6 trigger calls must be non-fatal to the primary operation | RULE G6-1, try/catch pattern |

---

## 11. Governance Version History

| Version | Block | Date | Summary |
|---|---|---|---|
| v0.1 | G1 | 2026-03-31 | Prevention rules registry (23 rules) |
| v0.2 | G2 | 2026-03-31 | Incident protocol + P0–P3 model |
| v0.3 | G3 | 2026-03-31 | QA gate protocol + auto-QA agent |
| v0.4 | G4 | 2026-03-31 | Commit reliability + G4 stub gate |
| v0.5 | G5 | 2026-04-01 | Governance memory + 5 audit tables |
| v0.6 | G6 | 2026-04-01 | Orchestration layer + 6 n8n workflows + 6 trigger routes |
| v0.7 | G7 | 2026-04-01 | Constitutional documents (System-Charter, AOS, Domain-Rules, Handoff-Rules, Settings-Changelog) |
| **v1.0** | **G8** | **2026-04-01** | **Full E2E validation, RULE-25, canonical governance bundle, Governance v1 FROZEN** |

---

## BUILDOS GOVERNANCE v1 — LOCKED

**Frozen:** 2026-04-01
**Block:** G8
**Condition:** All G8 success conditions satisfied (see G8-EXECUTION-REPORT.md)

Any future change to this governance package must go through:

```
incident → prevention rule → changelog entry → governance block → commit → deploy
```

There are no exceptions to this process.

---

*See also: [System-Charter.md](./System-Charter.md) | [Architect-Operating-System.md](./Architect-Operating-System.md) | [Domain-Rules.md](./Domain-Rules.md) | [Handoff-Rules.md](./Handoff-Rules.md) | [Settings-Changelog.md](./Settings-Changelog.md) | [ARCHITECT-BOOTSTRAP-PROMPT.md](./ARCHITECT-BOOTSTRAP-PROMPT.md)*
