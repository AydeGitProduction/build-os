# BuildOS — System Charter

**Version:** 1.0
**Block:** G7 — Final Governance Lock
**Date:** 2026-04-01
**Status:** LOCKED — Constitutional Law
**Supersedes:** All informal system descriptions

---

## Preamble

This charter is the constitutional document of BuildOS. It defines what the system is, what it is not, what it may and may not claim, and which constraints are non-negotiable. Every governance document, protocol, rule, and workflow derives its authority from this charter. In any conflict between this charter and any other document, this charter governs.

This charter does not change without a formal governance block execution and logged entry in the Settings Changelog.

See also: [Architect-Operating-System.md](./Architect-Operating-System.md) | [Domain-Rules.md](./Domain-Rules.md) | [Handoff-Rules.md](./Handoff-Rules.md) | [Settings-Changelog.md](./Settings-Changelog.md)

---

## 1. What BuildOS Is

BuildOS is an **AI-augmented software project management and execution system**. It provides a pipeline for:

- Defining features and decomposing them into atomic tasks
- Routing tasks to autonomous AI agents for execution
- Running automated QA against agent outputs
- Tracking all governance-relevant actions in append-only audit tables
- Escalating repeated failures to formal incidents
- Gating releases behind automated checks

**The verified production truth (as of 2026-04-01):**

- Tasks are dispatched to agent workers via n8n webhooks or an inline API executor
- QA verdicts are applied by the `qa_security_auditor` agent via `/api/qa/verdict`
- Task completion triggers orchestration ticks that unlock dependent tasks
- Over 293 tasks have been completed through the pipeline as of the last audit
- Five governance tables (`task_events`, `handoff_events`, `settings_changes`, `release_gate_checks`, `manual_override_log`) record durable audit trails
- Six n8n governance workflows handle escalation, release gating, and event notification
- Twenty-three prevention rules encode lessons from production incidents

**BuildOS runs on:**
- Next.js App Router (TypeScript, Vercel serverless)
- Supabase (PostgreSQL + Row-Level Security)
- n8n (self-hosted or n8n Cloud) for workflow automation
- Anthropic Claude API for AI agent execution

---

## 2. What BuildOS Is Not

**BuildOS is not a fully autonomous coding system.** Agents execute tasks but do not self-direct. Tasks must be written by a human or Architect agent with explicit instructions. Agents cannot be told to "figure it out" — they require complete task contracts.

**BuildOS is not a zero-human-in-the-loop system.** Human review is required for: closing P0/P1 incidents, applying database migrations, approving releases through gate failures, and modifying prevention rules.

**BuildOS is not a continuous deployment system without gates.** Releases require release gate checks to pass. Gate failures must be acknowledged before proceeding.

**BuildOS is not infallible.** The system tracks its own failures via incidents. An incident-free record is not a signal of health — it may indicate a monitoring gap. Governance memory exists precisely because failures happen.

**BuildOS has not achieved AGI-level task autonomy.** Agents receive instructions and produce outputs. They do not learn, plan, or reason across tasks. Context is provided per task via the task contract.

---

## 3. Operating Boundaries

### 3.1 Autonomous Actions Permitted Without Human Approval

- Task dispatch to agent workers (system-initiated)
- QA verdict evaluation and task status transitions
- Escalation to P2/P3 incidents when automated thresholds are exceeded
- Writing to governance tables (all G5 tables, append-only)
- Firing n8n governance workflows
- Orchestration tick after task completion (to unlock dependencies)
- Running release gate checks

### 3.2 Actions That Require Human Approval

- Closing or resolving P0 or P1 incidents
- Applying database migrations (must be executed via Supabase SQL Editor)
- Modifying prevention rules (requires governance log entry)
- Changing Vercel environment variables for production
- Pushing to the main branch when a release gate has failed
- Overriding escalation thresholds in any governance rule

### 3.3 Actions That Are Prohibited at Any Time

- Executing DDL via `pg.Client` or `node-postgres` directly (RULE-09)
- Bypassing QA verdict to mark a task completed (tasks must pass via `/api/qa/verdict`)
- Creating incidents without a title, severity, incident_type, and owner_domain
- Closing an incident without a linked prevention rule or fix record (G2 enforcement)
- Making a governance table write outside of a try/catch (writes must be non-fatal to callers)
- Claiming a feature is "complete" without a durable row in a governance table proving it

---

## 4. Product Truth vs. Overstated Claims

The following claims are **prohibited** in any document, report, or communication:

| Prohibited Claim | True Statement |
|---|---|
| "BuildOS is fully autonomous" | BuildOS automates task execution. Human oversight is required for incidents, migrations, and releases. |
| "AI writes production code with no review" | Agents write code that goes through automated QA. Humans retain final authority over releases. |
| "The pipeline never fails" | The pipeline tracks its own failures via incidents. Failures are expected and governed. |
| "All tasks complete successfully" | Task failure, retry, and escalation are designed-in behaviors of the system. |
| "The governance layer is real-time" | Governance writes are append-only and non-blocking. They may lag up to a few seconds behind the primary operation. |
| "BuildOS self-improves its code" | Prevention rules encode lessons from incidents, but they are applied to future task instructions by a human or Architect — not automatically to existing code. |

---

## 5. Autonomous vs. Human-Assisted Reality

| Layer | Autonomous | Human Required |
|---|---|---|
| Task dispatch | ✅ | |
| Agent execution | ✅ | |
| QA evaluation | ✅ (auto-QA agent) | Optional: human can override |
| Incident creation | ✅ (P2+ via escalation thresholds) | P0/P1 also allowed human-created |
| Incident resolution | | ✅ Always |
| Database migration | | ✅ Always (SQL Editor) |
| Prevention rule creation | | ✅ Always |
| Release gate evaluation | ✅ | |
| Release gate override | | ✅ Always |
| Governance memory writes | ✅ (auto-hooks) | |
| Settings Changelog entries | | ✅ For non-automated changes |
| Manual override log | ✅ (system-recorded) | ✅ (human-authorized) |

---

## 6. Governance Hierarchy

The following is the order of authority for governance decisions, from highest to lowest:

1. **System Charter** (this document) — constitutional, cannot be overridden by any other document
2. **Domain Rules** — hard technical constraints on all code and configuration
3. **Incident Protocol (G2)** — governs how failures are tracked and resolved
4. **Prevention Rules Registry (G1)** — encodes permanent lessons from incidents
5. **QA Gate Protocol (G3)** — governs task completion standards
6. **Commit Reliability Protocol (G4)** — governs code delivery to the repository
7. **Governance Memory Protocol (G5)** — governs audit trail writes
8. **Governance Orchestration Protocol (G6)** — governs automated enforcement workflows
9. **Architect Operating System** — governs how the Architect creates and manages work
10. **Handoff Rules** — governs task-to-task handoff quality requirements
11. **IRIS Architect Protocol** — governs task authoring standards

In any conflict, the higher-numbered authority in this list prevails.

---

## 7. Source of Truth Hierarchy

When a question about system behavior arises, consult sources in this order:

1. **Production database state** — the ultimate source of truth for what has actually happened
2. **G5 governance tables** — append-only audit trail; `task_events`, `handoff_events`, `settings_changes`, `release_gate_checks`, `manual_override_log`
3. **Execution reports** (G1–G7, P9-series, P11-series) — document what was built and when
4. **API route source code** — defines what the system does
5. **This governance package** — defines what the system must do
6. **n8n workflow JSON files** — defines automation behavior

Documents that contradict production database state are wrong. The database is not wrong.

---

## 8. Release Truth Rules

A feature is **not real** unless all of the following are true:

1. The relevant code is committed to the `main` branch of `AydeGitProduction/build-os`
2. The Vercel deployment for that commit has reached state `READY`
3. The feature returns the expected response from the production URL (`https://web-lake-one-88.vercel.app`)
4. At least one durable row exists in a G5 governance table proving the feature was exercised in production

A migration is **not applied** unless it has been manually executed via the Supabase SQL Editor and the target table can be queried successfully via the REST API.

A governance block is **not complete** until its execution report is committed to the repository.

---

## 9. Non-Negotiable Constraints

These constraints cannot be waived, overridden, or deferred by any person, protocol, or automation:

| ID | Constraint | Source |
|---|---|---|
| NC-01 | No DDL via pg.Client or node-postgres | RULE-09 |
| NC-02 | No incident closure without linked prevention rule or fix record | G2 |
| NC-03 | Governance writes must be non-fatal to callers | G5, G6 |
| NC-04 | No task is "complete" without a QA verdict of PASS | G3 |
| NC-05 | No release through a failed gate without human override logged in manual_override_log | G5, G6 |
| NC-06 | Every governance block must produce an execution report committed to the repo | G7 |
| NC-07 | Sensitive env vars (SUPABASE_SERVICE_ROLE_KEY, API keys) must not target the development environment in Vercel | Vercel security |
| NC-08 | No silent fallback in routing decisions — every routing event must be persisted in routing_decisions | ERT-P6C |
| NC-09 | G5 writes must occur before n8n calls | RULE G6-2 |
| NC-10 | All G6 trigger calls must be non-fatal to the primary operation | RULE G6-1 |

---

## 10. Governance Trace Requirement

**Every governance-relevant action must leave a durable trace.**

"Governance-relevant" means any of the following:
- A task changes status
- A QA verdict is applied
- An agent handoff occurs
- An incident is opened, updated, or closed
- A prevention rule is created or modified
- A release gate is evaluated
- A manual override is applied
- A settings change is made to the governance system itself
- A governance block is executed

The durable trace must be one or more rows in a G5 governance table. The trace must be written as part of the primary operation (not after the fact), in a non-fatal try/catch so that trace failure never blocks the primary operation.

An action that has no trace in the governance tables is treated as if it did not happen, regardless of what any document, log, or report claims.

---

## 11. Charter Modification Process

This charter may only be modified by:
1. A formal governance block execution (G8+)
2. An entry in `docs/governance/Settings-Changelog.md` documenting the change
3. A commit to the main branch
4. A Vercel production deployment

Informal modifications (chat messages, PR comments, verbal agreements) do not modify this charter.

---

*This document is part of the BuildOS Governance Package v1. See [Architect-Operating-System.md](./Architect-Operating-System.md), [Domain-Rules.md](./Domain-Rules.md), [Handoff-Rules.md](./Handoff-Rules.md), and [Settings-Changelog.md](./Settings-Changelog.md) for the complete set.*
