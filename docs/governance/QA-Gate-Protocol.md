# QA Gate Protocol — Block G3
## BuildOS Governance Document

**Status:** Active — enforced from 2026-04-01
**Replaces:** Unconditional score=88 auto-pass (deprecated)
**Enforced by:** `apps/web/src/lib/qa-evaluator.ts`
**Results stored in:** `qa_results` table

---

## 1. Purpose

This protocol defines the minimum requirements for a valid QA verdict in BuildOS. Every task that produces agent output MUST pass through a real QA gate before it can be marked `completed`. No verdict is valid if it is unconditional or detached from evidence.

The unconditional `score=88 pass` pattern that allowed any non-empty output to complete a task has been removed. All task completions now require structured QA evaluation with evidence.

---

## 2. QA Categories

### Code Tasks
A task is classified as a **code task** if:
- `task_type` is one of: `code`, `schema`, `test`, `implementation`, `migration`
- OR `agent_role` is one of: `frontend_engineer`, `backend_engineer`, `infrastructure_engineer`

Code tasks require **all three checks**: compilation, requirement match, and contract sanity.

### Non-Code Tasks
All other tasks (documentation, analysis, planning, design, QA review) are **non-code tasks**.

Non-code tasks require: requirement match and output completeness.

---

## 3. Minimum Required Checks

### For Code Tasks

**A. Compilation Validity Check** (`compilation_passed`)

Preferred: `tsc --noEmit` on the generated files.

**Limitation (documented):** `tsc --noEmit` cannot be run directly on raw agent output text in the current Vercel serverless environment. The compilation check uses **deterministic static analysis** instead:

- Output must not contain known failure markers: `SyntaxError:`, `Cannot find module`, `COMPILATION_ERROR`, `BUILD_FAILED`, `TypeError:`, `ReferenceError:`
- Output must not be shorter than 50 characters for a code task
- If the task specifies `export` in description, output must contain `export`

This is documented as a limitation. A future improvement path is to write output to a temp TypeScript file and run `tsc --noEmit` within the Railway worker environment.

**B. Requirement Match** (`requirement_match_passed`)

- Output length must exceed minimum threshold (200 chars for code tasks)
- At least 2 key terms from the task title must appear in the output
- Output must not appear to be a raw error message (no `Error:` at start)

**C. Contract Sanity** (`contract_check_passed`)

- If task description mentions "route": output must contain `export` and at least one of `GET`, `POST`, `PUT`, `DELETE`, `default`
- If task description mentions "component": output must contain `export` and at least one of `function`, `const`, `default`
- If no specific contract terms are found in description, this check is `null` (not applicable — does not affect verdict)

### For Non-Code Tasks

**A. Requirement Match** (`requirement_match_passed`)
- Output length must exceed 100 characters
- At least 1 key term from the task title must appear in the output

**B. Output Completeness**
- Output must not be empty
- Output must not be a single-word acknowledgement

---

## 4. Verdict Model

| Verdict | Meaning | Task Status Effect |
|---------|---------|-------------------|
| `PASS` | All required checks passed | Task → `completed` |
| `FAIL` | Critical check failed (empty output, compilation error) | Task → `in_progress` (retry) or `failed` if max_retries exceeded |
| `RETRY_REQUIRED` | Non-critical check failed (incomplete output, missing contract element) | Task → `in_progress` with feedback |
| `BLOCKED` | System error during QA evaluation | Task → `blocked`, requires manual review |

---

## 5. Score Policy

Score is computed deterministically from check results. It is **not** an LLM judgment and **not** a fixed value.

| Component | Weight |
|-----------|--------|
| Base score | 100 |
| `compilation_passed = false` (code) | −30 |
| `requirement_match_passed = false` | −25 |
| `contract_check_passed = false` (code, if applicable) | −20 |
| Output empty | −100 (score floored at 0) |

**Pass threshold:** score ≥ 70
**Fail threshold:** score < 50
**Retry threshold:** score 50–69 (RETRY_REQUIRED verdict)

---

## 6. Rejection Criteria

A QA verdict MUST be rejected and the task returned for rework if ANY of the following are true:

1. **Output is empty or null** → FAIL
2. **Output contains known compilation error markers** (code tasks) → FAIL
3. **Output is shorter than minimum length threshold** → FAIL
4. **Task description mentions required exports but none found** → RETRY_REQUIRED
5. **Key terms from task title entirely absent from output** → RETRY_REQUIRED
6. **Output appears to be a raw error dump** (starts with `Error:` or `TypeError:`) → FAIL

---

## 7. Retry Policy

- FAIL or RETRY_REQUIRED verdict → task returns to `in_progress`
- `tasks.retry_count` is incremented
- QA feedback is written to `tasks.failure_detail` and `tasks.failure_suggestion`
- The next agent run will see this feedback in context
- If `retry_count >= max_retries`: task transitions to `failed` instead of `in_progress`

**Escalation threshold:** If `retry_count >= 2` and verdict is FAIL or RETRY_REQUIRED, an incident linkage record is created (see Section 9).

---

## 8. Evidence Requirements

Every QA result MUST be stored in the `qa_results` table with:

- `task_id` — which task was evaluated
- `verdict` — PASS / FAIL / RETRY_REQUIRED / BLOCKED
- `score` — computed from check results (not fixed)
- `qa_type` — `code` or `non_code`
- `compilation_passed` — boolean (code tasks only, `null` for non-code)
- `requirement_match_passed` — boolean
- `contract_check_passed` — boolean or `null` if not applicable
- `notes` — human-readable summary of what passed/failed
- `evidence_summary` — machine-readable JSON string with check outputs
- `evaluator_model` — `'buildos-qa-evaluator-v1'` (static analysis, not LLM)
- `retry_recommended` — boolean, true if verdict is RETRY_REQUIRED

---

## 9. Relationship to Incidents

QA failures can escalate to the incident management system (Block G2).

**Automatic escalation:** If a task has been QA-failed or retry-required `>= 2` times (`retry_count >= 2`), the QA evaluator creates an incident record linking the task.

- `incident_type`: `qa` or the task's failure category
- `severity`: P2 (repeated QA failure), P1 if the task is on a critical path
- `owner_domain`: `qa`
- The incident must be resolved before the task can be manually overridden

**Manual escalation:** A QA reviewer can escalate any verdict to an incident at any time via the incidents API.

---

## 10. Relationship to Prevention Rules

QA failures SHOULD be linked to a prevention rule from the `prevention_rules` registry (Block G1). When a pattern of QA failures is detected (e.g., repeated `contract_check_passed = false` for route tasks), a new prevention rule SHOULD be added to prevent future occurrences.

The QA evaluator does not automatically create prevention rules, but the escalation hook records enough context to enable manual rule creation.

---

## 11. Relationship to Task Completion

A task MAY ONLY be marked `completed` if:

1. A `qa_results` record exists for this task in the current run cycle
2. That record has `verdict = 'PASS'`
3. The QA score meets the pass threshold (≥ 70)

A task MUST NOT be marked `completed` solely because:
- Output is non-empty
- An agent produced any response
- The task has been waiting for a long time (sweep logic cannot unconditionally pass)

The sweep mechanism in `orchestrate/tick` and `supervisor.ts` now calls the real QA evaluator instead of submitting a fixed score=88 pass.

---

## 12. QA Type Reference

| qa_type | Agent Roles | Checks Required |
|---------|-------------|-----------------|
| `code` | frontend_engineer, backend_engineer, infrastructure_engineer | A + B + C |
| `code` | task_type: code, schema, test, implementation, migration | A + B + C |
| `non_code` | product_analyst, documentation_engineer, architect, cost_analyst, automation_engineer | B + completeness |
| `non_code` | qa_security_auditor | B + completeness |

---

## 13. Known Limitations

1. **tsc --noEmit not runnable on raw text** — The compilation check uses pattern-based static analysis. It catches obvious failures but cannot detect all TypeScript type errors. Full TypeScript validation requires writing output to disk and running `tsc`, which is not yet implemented in the Vercel serverless context.

2. **No LLM-based semantic evaluation** — Requirement match uses keyword presence, not semantic understanding. A task output could contain the right keywords but still be logically incorrect.

3. **Code not executed** — QA cannot verify runtime behavior. A function that compiles correctly might still have logic errors.

4. **Single-pass evaluation** — QA evaluates the latest agent output only. Historical context is not used in scoring (though it informs the escalation threshold via `retry_count`).

These limitations are documented here and must be referenced in any future G4+ improvement to QA.
