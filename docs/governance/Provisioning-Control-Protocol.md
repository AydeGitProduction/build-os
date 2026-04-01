# BuildOS — Provisioning Control Protocol

**Version:** 1.0
**Block:** G11 — Infra Hardening + Provisioning Control
**Date:** 2026-04-01
**Status:** ACTIVE — enforced in code
**Authority:** System-Charter.md (constitutional), Domain-Rules.md

---

## Overview

This document defines the rules, enforcement mechanisms, and audit requirements governing project creation and provisioning within BuildOS. It was established in G11 to eliminate provisioning bypass, prevent silent infrastructure drift, and enforce production/sandbox boundaries.

---

## 1. Approved Project Creation Path

All project creation MUST go through the canonical API path:

```
POST /api/projects
Authorization: Bearer {user_jwt}
Content-Type: application/json

{
  "name": "...",
  "workspace_id": "...",     ← REQUIRED
  "project_type": "saas",
  "sandbox_approved": true   ← REQUIRED for governance/stress-test projects
}
```

**Enforcement:**
- Route requires valid user JWT (Supabase auth). No JWT = 401 Unauthorized.
- `workspace_id` is required. Missing = 400 Bad Request.
- Any attempt to insert directly to the `projects` table bypassing the API will lack a provisioning audit record and will appear in the provisioning audit scan as `NO_PROVISIONING_AUDIT_RECORD`.

**What the approved path guarantees:**
1. User authentication verified
2. Workspace linkage valid
3. Provisioning audit record written to `settings_changes`
4. Production/sandbox boundary enforced (see Section 3)
5. GitHub + Vercel provisioning triggered (fire-and-forget, non-blocking)

---

## 2. Provisioning Audit Trail

Every project created through the approved path writes a durable audit record:

**Table:** `settings_changes`
**Pattern:** `setting_key = 'project_created_{project_id}'`

```json
{
  "setting_area": "provisioning",
  "setting_key": "project_created_<uuid>",
  "previous_value": "none",
  "new_value": "created",
  "reason": "Project '<name>' created via approved API path — workspace_id=<id>, user=<id>, sandbox_approved=<bool>, is_governance_test=<bool>",
  "changed_by": "<user_id>"
}
```

Projects that lack this record were either:
- Created before G11 (pre-G11 baseline)
- Created by direct DB insertion (provisioning bypass — governance incident)

**Audit scan:** `GET /api/governance/infra/provisioning-audit` runs a full scan and classifies all projects.

---

## 3. Production vs Sandbox Boundary

### Governance/Stress-Test Project Detection

Projects with names matching the following patterns are treated as governance test artifacts and require explicit sandbox approval:

| Pattern | Examples |
|---------|---------|
| `G{N}-` or `-G{N}` prefix/suffix | `G11-stress`, `g9-test` |
| `stress-test` or `stress_test` | `stress-test-crm` |
| `load-test` or `load_test` | `load-test-2026` |
| `governance-test` | `governance-test-v2` |
| `infra-test` | `infra-test-pipeline` |
| `test-stress` prefix | `test-stress-module` |
| `sandbox-test` | `sandbox-test-api` |

### Enforcement Rule

If a governance/stress-test project name is detected and `sandbox_approved: true` is NOT in the request:

→ **Request is rejected with 403 Forbidden**
→ **Rejection is logged to `settings_changes` as `sandbox_boundary_violation`**
→ **No project is created**

```json
{
  "error": "Sandbox boundary violation: governance/stress-test project names require sandbox_approved: true in the request body",
  "code": "SANDBOX_BOUNDARY_VIOLATION",
  "project_name": "G11-stress-test",
  "required": "Include { sandbox_approved: true } to create governance test projects"
}
```

### Approved Governance Test Creation

To create a governance test project:

```json
{
  "name": "G11-stress-test-module",
  "workspace_id": "...",
  "sandbox_approved": true
}
```

The `sandbox_approved: true` flag acknowledges that this is a test artifact. It is stored in the provisioning audit record for traceability.

---

## 4. Bypass Detection

### Detection Method

`GET /api/governance/infra/provisioning-audit` cross-references:
- All rows in `projects` table
- All `settings_changes` records with `setting_area='provisioning'` and `setting_key LIKE 'project_created_%'`

Projects without a matching audit record are flagged as potential bypass attempts.

### Severity Classification

| Flag | Severity | Meaning |
|------|---------|---------|
| `NO_WORKSPACE_ID` | CRITICAL | Project has no workspace linkage — scope bypass |
| `NO_PROVISIONING_AUDIT_RECORD` | HIGH | No audit trail — pre-G11 or bypass |
| `GOVERNANCE_TEST_PROJECT_WITHOUT_SANDBOX_APPROVAL` | MEDIUM | G-style project without sandbox flag |

### Required Response

On detection of a bypass (CRITICAL or HIGH severity flagged projects):
1. Create a governance incident via `POST /api/governance/incidents`
2. Severity: P1 for NO_WORKSPACE_ID, P2 for NO_PROVISIONING_AUDIT_RECORD
3. Close with a prevention rule referencing this protocol

---

## 5. N8N Governance Workflow Requirements

All 6 governance workflows must be active in n8n for the system to function correctly:

| Workflow | Env Var | Required |
|---------|---------|---------|
| task_created | `N8N_GOVERNANCE_TASK_CREATED_URL` | YES |
| task_completed | `N8N_GOVERNANCE_TASK_COMPLETED_URL` | YES |
| qa_failed | `N8N_GOVERNANCE_QA_FAILED_URL` | YES |
| incident_created | `N8N_GOVERNANCE_INCIDENT_CREATED_URL` | YES |
| commit_failure | `N8N_GOVERNANCE_COMMIT_FAILURE_URL` | YES |
| release_gate | `N8N_GOVERNANCE_RELEASE_GATE_URL` | YES |

**Fail-loudly rule (G11):** If any env var is missing when a trigger fires:
- `n8n_misconfigured` event is logged to `task_events` (or `settings_changes` for non-task triggers)
- Response includes `n8n_misconfigured: true` and explicit warning
- Pipeline is NOT blocked (RULE G6-1 preserved)

**Activation check:** `GET /api/governance/infra/n8n-health`
- Probes all 6 URLs to verify activation state (not just env var presence)
- HTTP 200/202 = active, HTTP 404 = inactive/unregistered
- Writes result to `settings_changes` for audit trail

---

## 6. Infra Fail-Loudly Rules (G11)

The following infrastructure states are NEVER allowed to be silent:

| Condition | Previous behavior | G11 behavior |
|-----------|-----------------|--------------|
| Missing n8n URL env var | Silent skip | Log `n8n_misconfigured`, surface in response |
| Inactive n8n workflow | Silent 404 | Detected by health check, logged |
| Project created outside approved path | Not detected | Flagged in provisioning-audit scan |
| Governance test project in production without sandbox_approved | Silent creation | 403 + audit log |
| Project with no workspace_id | Allowed | Flagged CRITICAL in audit scan |

---

## 7. Enforcement Locations

| Rule | Enforced in |
|------|------------|
| Workspace required | `apps/web/src/app/api/projects/route.ts` |
| User JWT required | `apps/web/src/app/api/projects/route.ts` |
| Sandbox boundary | `apps/web/src/app/api/projects/route.ts` |
| Provisioning audit write | `apps/web/src/app/api/projects/route.ts` |
| n8n fail-loudly | All 6 `trigger/*/route.ts` files |
| n8n health check | `apps/web/src/app/api/governance/infra/n8n-health/route.ts` |
| Provisioning audit scan | `apps/web/src/app/api/governance/infra/provisioning-audit/route.ts` |

---

## 8. Operational Runbook

### Check n8n workflow activation state
```bash
curl -X GET https://web-lake-one-88.vercel.app/api/governance/infra/n8n-health \
  -H "X-Buildos-Secret: {secret}"
```

### Run provisioning audit scan
```bash
curl -X GET https://web-lake-one-88.vercel.app/api/governance/infra/provisioning-audit \
  -H "X-Buildos-Secret: {secret}"
```

### Create a governance test project (approved)
```bash
curl -X POST https://web-lake-one-88.vercel.app/api/projects \
  -H "Authorization: Bearer {user_jwt}" \
  -H "Content-Type: application/json" \
  -d '{"name": "G11-test", "workspace_id": "...", "sandbox_approved": true}'
```

### Attempt bypass (rejected)
```bash
curl -X POST https://web-lake-one-88.vercel.app/api/projects \
  -H "Authorization: Bearer {user_jwt}" \
  -H "Content-Type: application/json" \
  -d '{"name": "G11-test", "workspace_id": "..."}'
# → 403 SANDBOX_BOUNDARY_VIOLATION
```

---

## Change History

| Date | Block | Change |
|------|-------|--------|
| 2026-04-01 | G11 | Document created. Provisioning control, sandbox boundary, n8n fail-loudly, and audit trail implemented. |

---

*This document is part of the BuildOS Governance Package v1. See [System-Charter.md](./System-Charter.md), [Domain-Rules.md](./Domain-Rules.md), and [Settings-Changelog.md](./Settings-Changelog.md) for additional context.*
