# BuildOS — Commit Reliability Protocol

**Version:** 1.0
**Block:** G4
**Created:** 2026-04-01
**Status:** ACTIVE
**Supersedes:** Ad-hoc commit path (pre-G4)

---

## 1. Purpose

This protocol defines the mandatory commit reliability layer for all code-delivery tasks in BuildOS. A task that produces code output is NOT considered successful unless the expected repository change is verified.

**Core principle:** Task completion and repository state must be coupled. A task marked `awaiting_review` or `completed` without a verified GitHub commit is a false positive. False positives corrupt the delivery record and erode trust in the autonomous pipeline.

---

## 2. Relationship to Other Governance Documents

| Document | Relationship |
|----------|-------------|
| `Prevention-Rules-Registry.md` | RULE-11 (stub files), RULE-13 (path comment), RULE-14 (token freshness) — this protocol is the **enforcement implementation** of those rules |
| `Incident-Protocol.md` | Commit verification failures that repeat or escalate → P1 incidents via this protocol |
| `QA-Gate-Protocol.md` | QA gate runs after commit verification; a task with `commit_verified=false` must not reach QA |

---

## 3. When Code Tasks Are Allowed to Dispatch

A task with `task_type` in `['code', 'schema', 'test']` may only dispatch when:

1. **Resource lock is available** (existing dispatch gate — `resource_locks`)
2. **Token freshness confirmed** — GitHub App private key is present in env and a fresh installation token can be obtained (checked at dispatch time for CREATE tasks, checked again at commit time)
3. **Stub file created** (CREATE tasks only) — if the task's `context_payload` names a target file path, a stub must exist in the repo before dispatch

Tasks missing any condition above are blocked at dispatch with a clear error. Dispatch must NEVER silently skip these checks.

---

## 4. Rules for CREATE_NEW_FILE Tasks

A CREATE task intends to write a file that does not yet exist in the repository.

### 4.1 Stub Creation Requirement (RULE-11)

Before a CREATE task is dispatched:
- The system MUST detect the intended file path from `context_payload.task_contract.file_path` (or equivalent field)
- The system MUST push a stub file to the target path in GitHub
- The stub content is: `// {path}\n// BuildOS stub — task {task_id}\n// Replace this file with real implementation\n`
- If stub creation fails: task dispatch is blocked
- `commit_delivery_logs.stub_created` is set to `true` on success

**Rationale:** Without a stub, two agents might both attempt to CREATE the same path, causing a merge conflict or silent overwrite. A stub also "claims" the path, making the eventual UPDATE deterministic.

### 4.2 Path Comment Requirement (RULE-13)

Every code block in agent output MUST begin with a path comment as the first line:
```
// apps/web/src/lib/example.ts
```

The code generator validates this before processing output. Files missing the path comment are rejected at `parseAgentOutputToOperations()` with a `compile_failed` status.

---

## 5. Token Freshness Requirement (RULE-14)

GitHub App installation tokens expire after 1 hour. Stale tokens cause silent commit failure: the API returns 401 but the task may still be marked successful.

### 5.1 Enforcement

The `commit-reliability.ts` module provides `ensureFreshToken()`, which:
- ALWAYS calls `getInstallationToken()` — no caching, no reuse
- Records `token_refreshed: true` in `commit_delivery_logs`
- If the JWT signing fails or the installation token exchange returns non-2xx: throws immediately, commit path is aborted

**Cached tokens are FORBIDDEN.** Any code that stores or reuses an installation token across requests violates this rule.

### 5.2 Pre-Commit Validation

Before writing the tree to GitHub, `commitFilesToGitHub()` validates that all required env vars are present. If any are missing, it returns `{ success: false, error: "missing env vars: ..." }`. The generate route treats this as a hard failure for CREATE tasks.

---

## 6. Commit Verification Requirement

After every `commitFilesToGitHub()` call that returns `success: true`:

1. **Verify commit exists** — the returned `commitSha` must match HEAD on the target branch
2. **Verify file exists** — GET `/repos/{owner}/{repo}/contents/{path}?ref={branch}` must return HTTP 200 for each committed path
3. **Record result** — insert into `commit_delivery_logs` with `commit_verified: true/false`

Verification uses a fresh installation token (not the one used for the commit).

---

## 7. Failure Conditions

| Condition | Behavior |
|-----------|----------|
| Missing env vars | Dispatch blocked; generate aborts before commit attempt |
| Token exchange fails (401/403) | Commit aborted; task blocked; incident created |
| Stub creation fails (CREATE task) | Dispatch blocked; task not advanced to `dispatched` |
| Commit returns non-2xx | `commit_verified=false` logged; task forced back to `blocked` |
| File not found after commit | `commit_verified=false` logged; task forced back to `blocked` |
| Verification fails 3+ times for same task | Incident escalated to P1; `escalated=true` in delivery log |

---

## 8. Retry and Fail Behavior

- A task with `commit_verified=false` is set to `status='blocked'` with `failure_category='commit_delivery'`
- The task is eligible for retry via the standard retry mechanism (max retries apply)
- On retry, the full pipeline runs again: fresh token → commit → verify
- If a task exhausts retries with `commit_verified=false`: it is permanently blocked and an incident is created

There is no silent fallback. A task must not advance to `awaiting_review` without `commit_verified=true`.

---

## 9. `commit_delivery_logs` Table Schema

```sql
CREATE TABLE commit_delivery_logs (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              uuid          NOT NULL,
  project_id           uuid,
  repo_name            text          NOT NULL,
  branch_name          text          NOT NULL DEFAULT 'main',
  target_path          text          NOT NULL,
  stub_created         boolean       NOT NULL DEFAULT false,
  token_refreshed      boolean       NOT NULL DEFAULT false,
  commit_sha           text,
  commit_verified      boolean       NOT NULL DEFAULT false,
  verification_notes   text,
  escalated            boolean       NOT NULL DEFAULT false,
  incident_id          uuid,
  created_at           timestamptz   NOT NULL DEFAULT now()
);
```

One row is inserted per file per commit attempt.

---

## 10. Relationship to QA Gate

The QA gate (`QA-Gate-Protocol.md`) runs AFTER commit verification. Flow:

```
agent output received
  → commit attempted
    → commit verified? YES → task: awaiting_review → QA gate runs
    → commit verified? NO  → task: blocked → commit_delivery_logs updated → (retry or incident)
```

QA must never run on a task whose code was not verified in the repository.

---

## 11. Relationship to Incidents

Escalation conditions (see `Incident-Protocol.md`):

| Trigger | Severity | Type | Owner |
|---------|----------|------|-------|
| Token exchange failure on 3+ tasks in same session | P1 | infra | infra |
| Commit verification failure on same task 3+ times | P1 | workflow | backend |
| Stub creation blocked > 5 dispatches in 1 hour | P1 | workflow | backend |

Incident is created via `escalateToIncident()` in `commit-reliability.ts`, writing directly to the `incidents` table with severity, type, and a link to the triggering `commit_delivery_logs` row.

---

## 12. Relationship to Prevention Rules Registry

| Rule | Status | Enforced By |
|------|--------|-------------|
| RULE-11 — Stub file before CREATE task | Active | `commit-reliability.ts → createStubFile()` + dispatch gate |
| RULE-13 — Path comment first line | Active | `code-generator.ts → parseAgentOutputToOperations()` |
| RULE-14 — Verify token age before sprint | Active | `commit-reliability.ts → ensureFreshToken()` |

---

## 13. Implementation Reference

| Module | Location | Responsibility |
|--------|----------|---------------|
| `commit-reliability.ts` | `apps/web/src/lib/` | Core: stub, token, verify, log, escalate |
| `migrate-g4/route.ts` | `apps/web/src/app/api/governance/` | DDL: create `commit_delivery_logs` table |
| `agent/generate/route.ts` | `apps/web/src/app/api/agent/` | Enforcement: gate commit verification result |
| `dispatch/task/route.ts` | `apps/web/src/app/api/dispatch/` | Enforcement: stub gate before dispatch |
