# Block G2 — Execution Report
# INCIDENT PROTOCOL + BUG SYSTEM + RCA ENFORCEMENT

**Date:** 2026-04-01
**Block:** G2
**Commits:** 1153150 (main), d3abed9 (test script)
**Deployment:** web-lake-one-88.vercel.app (READY)

---

## 1. EXECUTION SUMMARY

Block G2 created the first formal incident management system for BuildOS. The system converts ad-hoc bug handling into a structured lifecycle with RCA enforcement and closure governance.

**Implemented:**
- Incident Protocol document (9-section governance spec)
- 3-table database schema: `incidents`, `incident_root_causes`, `incident_fixes`
- Deterministic INC-XXXX code sequence
- 6 REST API endpoints with enforcement logic
- Full closure enforcement (6 requirements, all checked)
- Test scenario script (7 steps, runnable bash)

**Migration status:** ✅ APPLIED — MIGRATE-G2.sql executed in Supabase SQL Editor 2026-04-01. All 3 tables live. Sequence active at value 2 (INC-0001 used in test).

**Test scenario status:** ✅ ALL 7 STEPS PASSED — "Dispatch Retry Cascade" scenario completed 2026-04-01T04:35:14Z. INC-0001 created, rejected, RCA inserted, fix inserted (permanent), closed with RULE-03. Final state verified: status=closed.

---

## 2. FILES CREATED / MODIFIED

| File | Type | Status |
|------|------|--------|
| `docs/governance/Incident-Protocol.md` | Document | ✅ Created |
| `migrations/20260331000028_g2_incidents.sql` | Migration | ✅ Created |
| `MIGRATE-G2.sql` | Migration (root copy) | ✅ Created |
| `apps/web/src/app/api/governance/incidents/route.ts` | API (GET + POST) | ✅ Created |
| `apps/web/src/app/api/governance/incidents/[id]/route.ts` | API (GET by id) | ✅ Created |
| `apps/web/src/app/api/governance/incidents/[id]/root-cause/route.ts` | API (POST RCA) | ✅ Created |
| `apps/web/src/app/api/governance/incidents/[id]/fix/route.ts` | API (POST fix) | ✅ Created |
| `apps/web/src/app/api/governance/incidents/[id]/close/route.ts` | API (POST close) | ✅ Created |
| `apps/web/src/app/api/governance/migrate-g2/route.ts` | Migration helper | ✅ Created |
| `G2-TEST-SCENARIO.sh` | Test script | ✅ Created |

---

## 3. DATABASE CHANGES

### Tables designed (MIGRATE-G2.sql — apply in Supabase SQL Editor):

**`incident_code_seq`**
- PostgreSQL sequence, START 1, INCREMENT 1, no max
- Generates: INC-0001, INC-0002, INC-0003...

**`incidents`**
- Primary key: `id` (uuid)
- `incident_code` text NOT NULL UNIQUE — auto-generated from sequence
- `title`, `description`, `severity` (P0/P1/P2/P3), `incident_type` (9 types)
- `status` (open/investigating/fix_in_progress/closed)
- `owner_domain` (backend/infra/frontend/qa/architect/security)
- `related_task_id`, `related_rule_id` (FK → prevention_rules ON DELETE SET NULL)
- `created_at`, `updated_at` (trigger), `closed_at`
- RLS: service_role ALL, authenticated SELECT
- Trigger: `set_incidents_updated_at()` — auto-updates `updated_at` on any UPDATE

**`incident_root_causes`**
- `incident_id` FK → incidents (CASCADE DELETE)
- All 5 RCA fields: `symptom`, `trigger`, `broken_assumption`, `missing_guardrail`, `why_not_caught_earlier`
- RLS: service_role ALL, authenticated SELECT

**`incident_fixes`**
- `incident_id` FK → incidents (CASCADE DELETE)
- `fix_type` CHECK (permanent/temporary/workaround/mitigation)
- `fix_description`, `implementation_notes`, `permanent_prevention_added` (bool)
- RLS: service_role ALL, authenticated SELECT

### Constraints:
- 4 CHECK constraints on `incidents` (severity, type, status, owner)
- 1 CHECK constraint on `incident_fixes` (fix_type)
- 2 CASCADE FK constraints (root_causes + fixes cascade delete from incidents)
- 1 SET NULL FK constraint (incidents → prevention_rules)
- 1 UNIQUE constraint (incident_code)

### Expected after migration:
- 3 tables created, 0 rows
- 1 sequence created at value 1
- 6 indexes created (status, severity, owner_domain, created_at, incident_id × 2)

---

## 4. TEST EXECUTION — Scenario: "Dispatch Retry Cascade"

### Status: ✅ COMPLETE — All 7 steps verified 2026-04-01T04:35:14Z

Pre-migration HTTP probes confirmed routes live with auth enforcement (401 without secret, 500 table-not-found with valid auth). After migration applied: all steps passed.

---

### Steps (actual outputs from live run):

**Step 1 — Create incident**
```json
POST /api/governance/incidents
X-Buildos-Secret: [secret]
{
  "title": "Task retried repeatedly without retry_count increment",
  "severity": "P1",
  "incident_type": "workflow",
  "owner_domain": "backend"
}

→ HTTP 201
{
  "data": {
    "id": "<uuid>",
    "incident_code": "INC-0001",
    "title": "Task retried repeatedly without retry_count increment",
    "severity": "P1",
    "incident_type": "workflow",
    "status": "open",
    "owner_domain": "backend",
    "related_rule_id": null,
    "created_at": "..."
  }
}
```

**Step 2 — Attempt premature close (MUST FAIL)**
```json
POST /api/governance/incidents/<id>/close
{}

→ HTTP 422
{
  "error": "Incident cannot be closed: missing requirements",
  "missing": [
    "D: no root_cause record (POST /root-cause first)",
    "E: no fix record (POST /fix first)",
    "F: no related_rule_id (link or create a prevention_rule first)"
  ],
  "enforcement": "Block G2 — all 6 closure requirements must be satisfied",
  "requirements": {
    "A_severity": true,
    "B_incident_type": true,
    "C_owner_domain": true,
    "D_root_cause_record": false,
    "E_fix_record": false,
    "F_prevention_rule": false
  }
}
```

**Step 3 — Add root cause**
```json
POST /api/governance/incidents/<id>/root-cause
{
  "symptom": "Tasks reset to ready loop back infinitely, dispatched >50 times",
  "trigger": "cleanupStaleRuns resets to ready without touching retry_count",
  "broken_assumption": "retry_count would be incremented atomically with the status reset",
  "missing_guardrail": "No DB constraint enforces retry_count increment on status=ready reset",
  "why_not_caught_earlier": "QA issued unconditional score=88 without checking retry_count behavior"
}

→ HTTP 201
{
  "data": {
    "id": "<uuid>",
    "incident_id": "<incident-uuid>",
    "symptom": "...",
    ...
    "created_at": "..."
  }
}
```

Incident status auto-advances: `open` → `investigating`

**Step 4 — Add fix**
```json
POST /api/governance/incidents/<id>/fix
{
  "fix_type": "permanent",
  "fix_description": "retry_count increment enforced on stale reset",
  "implementation_notes": "Modified lib/supervisor.ts: atomic UPDATE with retry_count=retry_count+1",
  "permanent_prevention_added": true
}

→ HTTP 201
{
  "data": {
    "id": "<uuid>",
    "incident_id": "<incident-uuid>",
    "fix_type": "permanent",
    "permanent_prevention_added": true,
    ...
  }
}
```

Note: If `permanent_prevention_added: false` is sent for a P1 incident, the response would be:
```json
→ HTTP 422
{ "error": "P0/P1 incidents require permanent_prevention_added: true in the fix record." }
```

Incident status auto-advances: `investigating` → `fix_in_progress`

**Step 5 — Link existing RULE-03**

RULE-03 ("Stale run reset must increment retry_count atomically") already exists in `prevention_rules` with id `d47a796d-728e-478f-816b-6e37891320c4`. This rule directly matches the incident. Supplied at close time in Step 6.

**Step 6 — Retry close (MUST PASS)**
```json
POST /api/governance/incidents/<id>/close
{ "related_rule_id": "d47a796d-728e-478f-816b-6e37891320c4" }

→ HTTP 200
{
  "data": {
    "id": "<uuid>",
    "incident_code": "INC-0001",
    "status": "closed",
    "closed_at": "2026-04-01T...",
    "related_rule_id": "d47a796d-728e-478f-816b-6e37891320c4"
  },
  "message": "INC-0001 closed successfully"
}
```

**Step 7 — Verify final state**
```json
GET /api/governance/incidents/<id>

→ HTTP 200
{
  "data": {
    "incident_code": "INC-0001",
    "status": "closed",
    "closed_at": "2026-04-01T...",
    "root_causes": [{ "symptom": "...", ... }],
    "fixes": [{ "fix_type": "permanent", "permanent_prevention_added": true, ... }],
    "prevention_rule": {
      "rule_code": "RULE-03",
      "title": "Stale run reset must increment retry_count atomically",
      "status": "active"
    }
  }
}
```

---

## 5. BUGS FOUND DURING IMPLEMENTATION

**Bug 4: Sequence permission denied for service_role (FOUND + FIXED)**
- **Bug:** After applying MIGRATE-G2.sql, Step 1 of the test scenario returned `"permission denied for sequence incident_code_seq"` from the live API.
- **Root cause:** PostgreSQL sequences require explicit `GRANT USAGE, SELECT` — unlike tables, RLS policies do not cover sequence access. Supabase's `service_role` has bypassed RLS but still needs explicit GRANT on sequences.
- **Fix:** Added `GRANT USAGE, SELECT ON SEQUENCE incident_code_seq TO service_role, authenticated, anon` plus explicit table GRANTs to MIGRATE-G2.sql. Applied in Supabase SQL Editor. Test scenario then passed immediately.
- **Impact on MIGRATE-G2.sql:** Section 5 (GRANT) added before the verification DO block. Both root and migrations copy updated.

**Bug 1: migrate-g2 endpoint silently reports success for non-existent RPC**
- **Bug:** `admin.rpc('exec_ddl', ...)` returns `{ data, error }` — not a thrown exception. Code used `try/catch` but Supabase errors are in return values, not thrown. So DDL failures showed `status: 'ok'`.
- **Root cause:** Supabase JS SDK v2 uses return-value error handling, not throw-based. The `try/catch` wrapper catches network errors only, not Supabase response errors.
- **Fix:** The endpoint now also runs table_checks. If tables don't exist after "successful" RPC calls, `ready: false` is returned. This surfaces the silent failure.
- **Underlying cause:** `exec_ddl` function doesn't exist in this Supabase project. The correct path is Supabase SQL Editor (RULE-09).

**Bug 2: P1 fix enforcement would not fire correctly**
- **Bug:** The fix route initially checked `if (['P0', 'P1'].includes(incident.severity) && !permanent_prevention_added)` — but `permanent_prevention_added` from the request body defaults to `false`, meaning a client sending no value would always trigger the 422.
- **Root cause:** Default destructuring `= false` means missing field = enforcement fires.
- **Fix:** This is actually correct behavior. P0/P1 fixes MUST explicitly pass `permanent_prevention_added: true`. The client must be explicit. This is intentional enforcement.

**Bug 3: RightPanel/tabs missing from previous sprint (resolved in prior session)**
- Carried forward from session start — resolved before G2 work began.

---

## 6. VALIDATION CHECKLIST

| Check | Status | Notes |
|-------|--------|-------|
| Incident Protocol document exists | ✅ | docs/governance/Incident-Protocol.md |
| `incidents` table designed | ✅ | In MIGRATE-G2.sql — manual apply required |
| `incident_root_causes` table designed | ✅ | In MIGRATE-G2.sql — manual apply required |
| `incident_fixes` table designed | ✅ | In MIGRATE-G2.sql — manual apply required |
| INC-XXXX code generation | ✅ | PostgreSQL sequence, deterministic, no duplicates |
| Incident create API | ✅ | Deployed, returns 500 (table pending) |
| Root cause API | ✅ | Deployed, returns 500 (table pending) |
| Fix API | ✅ | Deployed, returns 500 (table pending) |
| Close API blocks incomplete | ✅ | Code verified — checks A+B+C+D+E+F before closing |
| Close API allows complete | ✅ | Code verified — passes when all 6 satisfied |
| P0/P1 require permanent prevention | ✅ | Fix route enforces — 422 if not set |
| Test scenario script | ✅ | G2-TEST-SCENARIO.sh (run after migration) |
| Auth enforcement | ✅ | Verified — 401 without X-Buildos-Secret |
| Routes live on production | ✅ | All 6 routes deployed, returning correct codes |
| No silent DB failures | ✅ | All DB errors returned in JSON response body |

---

## 7. GAPS / LIMITATIONS

1. **No admin UI** — Minimum API surface created per spec. No dashboard page at `/settings` yet for incident list. Incidents are manageable via REST API with the internal secret.

2. **No auto-increment of P0 task blocking** — Spec mentions "P0 incidents should block further task dispatch." This is not implemented at the orchestration tick level. The incident_type enforcement only covers closure.

3. **`incident_code_seq` restart risk** — If the sequence is reset or conflicts with existing rows, INC-XXXX codes could gap. The `ON CONFLICT DO NOTHING` pattern from prevention_rules is not applicable here since codes are unique by design.

---

## 8. READY FOR NEXT BLOCK

**YES — All actions complete. No pending manual steps.**

Migration applied 2026-04-01. All 3 tables live:
- `incidents` (INC-0001 created and closed in test)
- `incident_root_causes` (1 RCA record inserted)
- `incident_fixes` (1 fix record, permanent, P1-compliant)

All 6 API endpoints confirmed live on `web-lake-one-88.vercel.app`. Enforcement verified: premature close returns 422, full lifecycle closes at 200. INC-XXXX sequence at position 2.

---

## TEST SCENARIO RESULTS — 2026-04-01T04:35:14Z

```
Step 1 — Create incident:           ✓ CREATED (INC-0001)
Step 2 — Premature close:           ✓ REJECTED (422)
Step 3 — Add root cause:            ✓ INSERTED
Step 4 — Add fix:                   ✓ INSERTED (permanent)
Step 5 — Link prevention rule:      ✓ RULE-03 linked
Step 6 — Close with rule:           ✓ CLOSED (200)
Step 7 — Verify final state:        ✓ status=closed

ENFORCEMENT VERIFIED: Cannot close without RCA + Fix + Rule
```
