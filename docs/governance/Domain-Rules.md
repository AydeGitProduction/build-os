# BuildOS — Domain Rules

**Version:** 1.0
**Block:** G7 — Final Governance Lock
**Date:** 2026-04-01
**Status:** LOCKED
**Authority:** Derives from [System-Charter.md](./System-Charter.md) §9 (Non-Negotiable Constraints)

---

## Preamble

Domain Rules are hard technical constraints that apply to all code, configuration, and infrastructure in BuildOS. They are not guidelines — they are requirements. Code that violates a domain rule must be corrected before the task that produced it can be marked `completed`. Prevention rules that encode past incidents are maintained separately in [Prevention-Rules-Registry.md](./Prevention-Rules-Registry.md).

See also: [System-Charter.md](./System-Charter.md) | [Architect-Operating-System.md](./Architect-Operating-System.md) | [Handoff-Rules.md](./Handoff-Rules.md) | [Settings-Changelog.md](./Settings-Changelog.md)

---

## 1. Database Rules

### DR-DB-01 — No DDL via application code
**Never** execute `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX`, or any other DDL statement via `pg.Client`, `node-postgres`, or any other programmatic database client from application code.

All DDL must be written to a versioned migration file in `migrations/` and applied manually via the Supabase SQL Editor.

**Reason:** Application-layer DDL bypasses Supabase RLS, connection pooling, and migration versioning. Production incidents caused by this pattern are classified as P0. See RULE-09 in Prevention-Rules-Registry.md.

### DR-DB-02 — Versioned migrations only
Every database schema change (table creation, column addition, index creation, constraint addition) must be represented by a migration file in `migrations/` with the format `YYYYMMDDHHMMSS_<description>.sql`.

Migration files are append-only. Never modify an existing migration file that has already been applied to production.

### DR-DB-03 — RLS must not be bypassed in user-facing routes
All user-facing API routes must use the `createServerSupabaseClient()` function which respects Row-Level Security. Only internal/system routes may use `createAdminSupabaseClient()` (service role). Routes that bypass RLS must be documented and authenticated with `X-Buildos-Secret`.

### DR-DB-04 — No direct foreign key to auth.users from application tables
Application tables must not add direct foreign key constraints to `auth.users`. User references in application tables use `uuid` columns that logically reference `auth.users.id` but without a FK constraint, following Supabase's recommended pattern.

### DR-DB-05 — Governance tables are append-only
The five G5 governance tables (`task_events`, `handoff_events`, `settings_changes`, `release_gate_checks`, `manual_override_log`) must never have rows updated or deleted by application code. Corrections are made by inserting new rows, not modifying existing ones.

### DR-DB-06 — UUID primary keys everywhere
All application tables must use `uuid` as the primary key type with `DEFAULT gen_random_uuid()`. Integer sequences are prohibited.

### DR-DB-07 — Timestamps must be timestamptz
All timestamp columns must use `timestamptz` (timestamp with timezone), never `timestamp` without timezone.

---

## 2. API Rules

### DR-API-01 — All routes must be authenticated
Every API route must perform authentication. Routes accept one of:
- User JWT (via Supabase session cookie, validated with `createServerSupabaseClient()`)
- Internal secret (`X-Buildos-Secret` header, validated against `BUILDOS_INTERNAL_SECRET` or `BUILDOS_SECRET` env var)
- Both (routes that accept either must validate at least one)

Routes that accept neither are prohibited.

### DR-API-02 — HTTP method semantics must be followed
- `GET`: read-only, no side effects, idempotent
- `POST`: create a new resource or trigger an action (not idempotent unless idempotency key is used)
- `PATCH`: partial update of an existing resource
- `DELETE`: soft-delete preferred; hard-delete requires explicit justification
- `PUT`: replace entire resource (rarely used; prefer PATCH)

### DR-API-03 — Error responses must use the standard shape
All error responses must return a JSON body with at minimum `{ "error": "<message>" }`. Never return an HTML error page from an API route. Never return a 200 status with an error in the body.

### DR-API-04 — All mutating routes must validate required fields
Every POST/PATCH route must:
1. Parse the request body
2. Validate all required fields
3. Return a 400 error with the list of missing fields if any required field is absent
4. Return a 422 error if a field value is invalid (wrong type, out of range, invalid enum value)

### DR-API-05 — Idempotency for task dispatch and QA verdict
The `/api/dispatch/task` and `/api/qa/verdict` routes must check an idempotency key before processing. Duplicate requests with the same idempotency key must return the cached response, not re-execute the operation.

### DR-API-06 — All governance routes return 202 for trigger operations
Routes under `/api/governance/trigger/*` must return 202 Accepted (not 200 or 201). The 202 status communicates that the request was accepted for processing, not that processing is complete.

### DR-API-07 — No governance write may block the primary operation
Any write to a G5 governance table from within a primary operation route (dispatch, verdict, etc.) must be wrapped in a non-fatal `try/catch`. If the governance write fails, the primary operation continues and returns its response.

### DR-API-08 — Rate limiting on public-facing routes
Routes accessible without authentication must have rate limiting configured at the Vercel edge or middleware level.

### DR-API-09 — No sensitive data in URL parameters
API keys, secrets, tokens, and UUIDs that could identify a specific resource must not be placed in URL query parameters. Use request body (POST) or Authorization header.

---

## 3. UI / Component Rules

### DR-UI-01 — No server-side data fetching in client components
Client components (files with `'use client'` directive) must not directly call Supabase or any server-only library. Data is fetched via server components, API routes, or React Query.

### DR-UI-02 — Loading and error states required
Every component that fetches data must implement:
- A loading state (skeleton, spinner, or placeholder)
- An error state (user-visible error message, not just a console.error)

### DR-UI-03 — No inline styles for layout
Layout is implemented via Tailwind CSS utility classes. Inline `style` props are permitted only for dynamic values that cannot be expressed as Tailwind classes.

### DR-UI-04 — No untyped `any` in component props
All component props must be typed. `any` is prohibited in component prop interfaces. `unknown` with type narrowing is acceptable where the type is genuinely unknown.

### DR-UI-05 — Accessibility baseline
All interactive elements (buttons, links, inputs) must have accessible labels. Buttons without visible text must have `aria-label`. Images must have `alt` text.

---

## 4. QA Rules

### DR-QA-01 — Every task must pass QA before `completed` status
A task may not be set to `status = 'completed'` by any route other than `/api/qa/verdict` after a `PASS` verdict. Direct task status updates that skip QA are prohibited.

### DR-QA-02 — QA verdicts are immutable
Once a `qa_verdicts` row is inserted, it must not be modified. If a QA verdict was incorrect, a new task run and new verdict are required.

### DR-QA-03 — QA failure threshold triggers escalation
Three QA failures on the same task within 24 hours must trigger a P2 incident via the G6 `qa-failed` trigger route. This is enforced by the trigger route itself.

### DR-QA-04 — Auto-QA score minimum
Auto-QA (score automatically assigned when no human reviewer is present) must never assign a `PASS` verdict with a score below 70. Scores below 70 indicate material defects.

### DR-QA-05 — QA verdict must reference the agent output
Every `qa_verdicts` row must reference the `agent_outputs.id` that was evaluated. QA verdicts without a linked agent output are invalid.

---

## 5. Commit / Code Delivery Rules

### DR-COMMIT-01 — No direct commits to main without task traceability
Every code change committed to the main branch must be traceable to a task in the `tasks` table. Ad-hoc commits without a task reference are prohibited.

### DR-COMMIT-02 — Stub files must be created before dispatch
For tasks of type `code`, `schema`, or `test` where the agent will create a new file: a stub file must be pushed to the repository before the task is dispatched to the agent. This is enforced by the G4 stub gate in `/api/dispatch/task`. See [Commit-Reliability-Protocol.md](./Commit-Reliability-Protocol.md).

### DR-COMMIT-03 — Commit SHAs must be recorded in commit_delivery_logs
Every commit made on behalf of a task must have a row in `commit_delivery_logs` with the `commit_sha` and `commit_verified` flag.

### DR-COMMIT-04 — Three commit failures trigger P1 escalation
Three `commit_verified = false` entries for the same task within 24 hours must trigger a P1 incident via the G6 `commit-failure` trigger route.

### DR-COMMIT-05 — No force-push to main
Force-pushing to the `main` branch is prohibited. All changes to main must be through standard commits, verified by the GitHub App installation token.

---

## 6. Governance Write Requirements

### DR-GOV-01 — G5 auto-hooks on all pipeline state changes
Every route that changes a task's status must write to `task_events` via a non-fatal G5 auto-hook. Routes that change task status without a G5 write are non-compliant.

### DR-GOV-02 — Agent handoffs must be logged
Every agent-to-agent handoff (e.g., dispatch → execution, execution → QA) must produce a row in `handoff_events`. The `from_agent` and `to_agent` fields must be populated.

### DR-GOV-03 — Settings changes must be logged
Any change to governance configuration (prevention rules, incident thresholds, escalation logic, env vars that affect governance behavior) must produce a row in `settings_changes`.

### DR-GOV-04 — Release gate checks must be logged
Every release gate evaluation (pass or fail) must produce a row in `release_gate_checks`. No release gate may run without leaving a durable trace.

### DR-GOV-05 — Manual overrides must be logged
Any human override of a governance constraint (e.g., overriding a failed release gate) must produce a row in `manual_override_log` with a reason.

### DR-GOV-06 — G5 writes must be non-fatal
Failure of any G5 governance table write must be caught and logged (console.warn), but must not propagate as an exception to the calling route or function.

---

## 7. Route and Auth Rules

### DR-AUTH-01 — Internal routes use X-Buildos-Secret
Routes intended for server-to-server calls (not directly from the browser) must validate the `X-Buildos-Secret` header against the `BUILDOS_INTERNAL_SECRET` or `BUILDOS_SECRET` environment variable.

### DR-AUTH-02 — The system UUID for internal actors
When an internal/system operation writes to a table that requires a user_id, the system UUID `00000000-0000-0000-0000-000000000000` must be used, not a null value.

### DR-AUTH-03 — Multiple valid secrets are permitted
Routes may accept multiple valid secrets (e.g., `N8N_WEBHOOK_SECRET`, `BUILDOS_INTERNAL_SECRET`, `BUILDOS_SECRET`) to allow different internal callers without requiring a single shared credential.

### DR-AUTH-04 — No hardcoded secrets in source code
All secrets, API keys, and tokens must come from environment variables. No secret value may appear in source code committed to the repository.

---

## 8. Migration Rules

### DR-MIG-01 — Migration files are named with UTC timestamps
Format: `YYYYMMDDHHMMSS_<description>.sql`. Example: `20260401000030_g5_governance_memory.sql`.

### DR-MIG-02 — Migrations use IF NOT EXISTS for idempotency
All `CREATE TABLE` and `CREATE INDEX` statements in migration files must use `IF NOT EXISTS` to ensure idempotency. Running a migration twice must not produce an error.

### DR-MIG-03 — Migrations must be applied by a human via Supabase SQL Editor
See DR-DB-01. After writing a migration file, a human must apply it via the Supabase dashboard SQL Editor. The system must not self-apply migrations.

### DR-MIG-04 — Applied migrations are tracked by verifying table existence
After applying a migration, verify it was applied by querying the target table via the Supabase REST API. A `PGRST205` error (relation does not exist) indicates the migration was not applied.

### DR-MIG-05 — Rollback scripts are required for destructive migrations
Any migration that drops a column, drops a table, or removes data must be accompanied by a rollback script in a comment at the top of the migration file.

---

## 9. Environment Variable Rules

### DR-ENV-01 — Sensitive vars must not target the development environment
When setting sensitive environment variables (API keys, service role keys, secrets) in Vercel, the target environments must be `["production", "preview"]` only. Setting sensitive vars to `"development"` is prohibited by Vercel and will be rejected.

### DR-ENV-02 — Updating sensitive vars requires delete + recreate
The Vercel API's PATCH method does not reliably update sensitive variable values. When a sensitive variable's value must be changed, the old variable must be deleted and a new one created.

### DR-ENV-03 — SUPABASE_SERVICE_ROLE_KEY must be verified after every deployment
After any Vercel deployment where environment variables were changed, verify that `SUPABASE_SERVICE_ROLE_KEY` is correctly set in production by calling an admin-protected endpoint. An empty or incorrect service role key will cause all admin client operations to fail silently.

### DR-ENV-04 — N8N_GOVERNANCE_*_URL vars are required for G6
The six `N8N_GOVERNANCE_*_URL` environment variables must be set in Vercel production for G6 governance workflows to fire. If these are absent, G6 will silently skip the n8n call (which is non-fatal per RULE G6-1), but the n8n automation layer will be inactive.

### DR-ENV-05 — All new env vars must be documented
When a new environment variable is added to the system, it must be listed in:
1. `apps/web/.env.example` (with a placeholder value)
2. The relevant protocol documentation
3. `docs/governance/Settings-Changelog.md`

---

*This document is part of the BuildOS Governance Package v1. See [System-Charter.md](./System-Charter.md), [Architect-Operating-System.md](./Architect-Operating-System.md), [Handoff-Rules.md](./Handoff-Rules.md), and [Settings-Changelog.md](./Settings-Changelog.md) for the complete set.*
