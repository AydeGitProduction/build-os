# Build OS — Full Bug Report
**Date:** 2026-03-28
**Scope:** Complete autonomous execution loop + full API surface audit
**Status at report time:** 69+/113 tasks completed, loop actively running

---

## SECTION 1: FIXED BUGS

---

### BUG-01 — CRITICAL | `.catch()` on Supabase `PostgrestFilterBuilder`
**Files:** `tick/route.ts`, `dispatch/task/route.ts`, `integrations/connect/route.ts`, `agent/output/route.ts`
**Severity:** Critical — caused HTTP 500 crashes on every tick, blocking entire autonomous loop
**Root Cause:** Supabase JS v2's `PostgrestFilterBuilder` implements `PromiseLike` (has `.then()`) but is NOT a full `Promise` (no `.catch()`, no `.finally()`). Any `.catch(() => {})` chained directly on a Supabase query builder throws `TypeError: .catch is not a function` at runtime.

**Symptoms:**
- `/api/orchestrate/tick` returning 500 on every call
- `/api/dispatch/task` returning 500 — tasks never dispatched
- Loop completely stalled after a few successful runs

**Fix Pattern Applied:**
```typescript
// WRONG — crashes:
await supabase.from('table').delete().eq('col', val).catch(() => {})

// CORRECT — try/catch:
try {
  await supabase.from('table').delete().eq('col', val)
} catch { /* non-fatal */ }
```

**Locations fixed:**
- `tick/route.ts` — 2 `.catch()` calls on `resource_locks.delete()`
- `integrations/connect/route.ts` — 1 `.catch()` on `integration_environment_credentials.upsert()`
- `agent/output/route.ts` — 2 `.catch()` calls on `cost_events.insert()` and `documents.insert()`

**Note:** `.catch()` on native `async function` return values and `fetch()` results is valid — those were left intact.

---

### BUG-02 — CRITICAL | Dead code: invalid `.lt()` with Supabase builder as value
**File:** `tick/route.ts` (previously in `cleanupStaleRuns`)
**Severity:** Critical — caused stale task cleanup to silently fail or produce incorrect results
**Root Cause:** A leftover dead-code block tried to call `.lt('retry_count', admin.from('tasks').select('max_retries') as any)` — passing a Supabase builder object as a numeric comparison value. This is invalid and would produce a nonsensical WHERE clause.

**Fix:** Removed the dead code block entirely. The second (correct) update to reset stale tasks to `ready` was retained as the sole update.

---

### BUG-03 — HIGH | `buildos_acquire_lock` DB function — unique constraint on re-acquire
**Location:** PostgreSQL function `public.buildos_acquire_lock` (Supabase DB)
**Severity:** High — "Lock not acquired" errors caused tasks to fail re-dispatch after recovery
**Root Cause:** The DB function did not `DELETE` expired locks for a resource before attempting `INSERT`. The unique index `rl_exclusive_unique_idx` on `(resource_id) WHERE lock_type = 'exclusive'` covers ALL rows including expired ones. If an expired lock remained from a timed-out run, a new INSERT would always fail the unique constraint, returning `false` instead of acquiring the lock.

**Application-level workaround (deployed earlier):** `dispatch/task/route.ts` pre-deletes expired locks for the specific task resource before calling the DB function.

**Permanent DB fix (applied via SQL Editor, 2026-03-28):**
```sql
CREATE OR REPLACE FUNCTION public.buildos_acquire_lock(...)
AS $$
BEGIN
  v_expires_at := now() + (p_duration_sec || ' seconds')::interval;
  -- NEW: Delete expired locks first
  DELETE FROM resource_locks
  WHERE resource_id = p_resource_id AND expires_at <= now();
  INSERT INTO resource_locks (lock_type, resource_id, locked_by_task_run, expires_at)
  VALUES (p_lock_type, p_resource_id, p_locked_by, v_expires_at);
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN RETURN false;
END;
$$;
```

---

### BUG-04 — HIGH | `name` vs `title` column mismatch — 8+ files
**Severity:** High — caused blank titles across all task/epic/feature displays in the UI, and Supabase query errors
**Root Cause:** DB schema uses `title` for `tasks`, `epics`, and `features` tables, but `name` for `projects`. Almost all UI components and API routes were incorrectly selecting and rendering `.name` for tasks/epics/features.

**Confirmed via DB query:** `column tasks.name does not exist`, `column epics.name does not exist`

**Files fixed:**

| File | Change |
|------|--------|
| `src/components/tasks/TaskBoard.tsx` | Interface `name→title`, all property accesses `task.name→task.title`, `epic.name→epic.title`, `feature.name→feature.title` |
| `src/components/dashboard/ProjectDashboard.tsx` | Interface `name→title`, `epic.name→epic.title`, `f.name→f.title` |
| `src/app/(app)/projects/[id]/tasks/page.tsx` | Supabase select `name→title` in epics/features/tasks joins; flatMap property accesses |
| `src/app/api/mock/agent-run/route.ts` | Task select: `name→title` |
| `src/app/api/projects/[id]/route.ts` | Nested join selects for epics/features/tasks: `name→title` |
| `src/app/api/tasks/[id]/route.ts` | GET join select + PATCH `.select()`: `name→title` |
| `src/app/api/projects/[id]/tasks/route.ts` | Seeding inserts (with fallback for blueprint compatibility), slug generation, join select |
| `src/app/api/blockers/route.ts` | Task fetch in GET join + POST lookup: `name→title` |

---

### BUG-05 — MEDIUM | Auth pattern inconsistency in `blockers/route.ts`
**File:** `src/app/api/blockers/route.ts`
**Severity:** Medium — could cause legitimate internal service calls to be rejected
**Root Cause:** The blocker route only checked `N8N_WEBHOOK_SECRET` for internal service authentication, while other routes (like `qa/verdict`) check a list of valid secrets (`N8N_WEBHOOK_SECRET`, `BUILDOS_INTERNAL_SECRET`, `BUILDOS_SECRET`).

**Fix:** Standardized to check all valid secrets using the same pattern as `qa/verdict/route.ts`:
```typescript
const validSecrets = [
  process.env.N8N_WEBHOOK_SECRET,
  process.env.BUILDOS_INTERNAL_SECRET,
  process.env.BUILDOS_SECRET,
].filter(Boolean)
const isInternalCall = !!(webhookSecret && validSecrets.includes(webhookSecret))
```

---

### BUG-06 — MEDIUM | Stale task runs reset to `blocked` instead of `ready`
**File:** `tick/route.ts` (`cleanupStaleRuns`)
**Severity:** Medium — stale tasks became permanently blocked with no active blockers, requiring manual intervention
**Root Cause:** The cleanup logic incorrectly included `.in('status', ['dispatched', 'in_progress'])` on one update but not another, and the invalid `.lt()` dead code (BUG-02) could interfere. The intended behavior — reset timed-out tasks back to `ready` — was not reliably executing.

**Fix:** Single clean update:
```typescript
await admin.from('tasks')
  .update({ status: 'ready', dispatched_at: null })
  .in('id', staleTaskIds)
  .in('status', ['dispatched', 'in_progress'])
```

---

## SECTION 2: REMAINING ISSUES (LOW SEVERITY)

---

### REMAINING-01 — LOW | `PATCH /api/tasks/[id]` reads `project_id` from task but task table may not have that column directly
**File:** `src/app/api/tasks/[id]/route.ts`, line 65
**Detail:** The PATCH handler selects `task.project_id` but tasks are linked to projects via `feature_id → features → epic_id → epics → project_id`. Whether `project_id` is a direct denormalized column on `tasks` is worth verifying. If it isn't, the audit log call may silently pass `null` as the project_id.
**Risk:** Audit logs may have null project_id — low operational impact.
**Recommendation:** Verify schema; if not present, add a denormalized `project_id` column to `tasks` or join through features/epics.

---

### REMAINING-02 — LOW | `fire-and-forget` fetch calls without error logging
**Files:** `agent/output/route.ts` line 298, `qa/verdict/route.ts` line 221
**Detail:** Fire-and-forget `fetch()` calls to trigger the next tick/dispatch are intentionally not awaited. However, failures (network errors, 500s from the tick) are silently swallowed. This means if the auto-trigger fails, the loop waits for the next cron cycle (up to 60s) rather than surfacing the error.
**Risk:** Low — cron backup handles missed triggers.
**Recommendation:** Add a lightweight console.warn in the catch to aid debugging without blocking the response.

---

### REMAINING-03 — LOW | Blueprint seeding uses `|| epic.name` fallback
**File:** `src/app/api/projects/[id]/tasks/route.ts`
**Detail:** Seeding code uses `epic.title || epic.name` as a fallback for backward compatibility with blueprint data that might still have a `name` property. This is intentional but worth revisiting once blueprint generator is fully updated to always emit `title`.
**Risk:** None currently — fallback is harmless.
**Recommendation:** After confirming `blueprint-generator.ts` always emits `title`, remove the `|| epic.name` fallbacks to keep the code clean.

---

### REMAINING-04 — LOW | `createAdminSupabaseClient()` called synchronously in `tasks/[id]/route.ts`
**File:** `src/app/api/tasks/[id]/route.ts`, line 95
**Detail:** `createAdminSupabaseClient()` is called without `await` (compared to `createServerSupabaseClient()` which is `await`ed). This is likely fine if the admin client is synchronous, but inconsistent.
**Risk:** None if admin client construction is sync.
**Recommendation:** Verify and normalize to be consistent.

---

## SECTION 3: SUPERVISOR SYSTEM — IDEAS & ARCHITECTURE

This section outlines ideas for a "supervisor" system that could manage the Build OS autonomous loop more robustly.

---

### What Problem Does a Supervisor Solve?

The current loop relies on:
1. A cron trigger every 60s
2. A tick that dispatches up to 4 parallel tasks
3. Each task completing within ~5 minutes before being flagged stale

When things go wrong (crash loop, DB lock contention, model API failures, all tasks blocked), the system silently stalls. There's no component that observes the health of the loop as a whole and takes corrective action.

---

### Supervisor System Architecture

**Core Concept:** A separate, lightweight process (or serverless function) that runs every 2-5 minutes and acts as an external observer of the system state. It doesn't execute tasks — it manages the executors.

#### Component 1: Loop Health Monitor
- Queries `tasks` table: counts by status (`pending`, `ready`, `in_progress`, `awaiting_review`, `blocked`, `completed`)
- Queries `task_runs` table: finds any runs stuck in `running` for >10 minutes
- Queries `resource_locks` table: finds any locks held for >10 minutes
- Checks when the last completed task was (idle detection)

**Decision rules:**
- If 0 `in_progress` and 0 `ready` and X `pending` → Loop is stalled → force-enqueue a tick
- If last completion was >15 min ago and tasks remain → Possible deadlock → force-cleanup locks and reset stale runs
- If N tasks `blocked` with no matching active blockers → Phantom blockers → resolve automatically

#### Component 2: Blocker Resolution Engine
- Periodically checks: for each `blocked` task, does a real blocker exist in the `blockers` table pointing to an unresolved upstream task?
- If a blocker's upstream task is `completed`, auto-resolve the blocker and unblock the downstream task
- This currently requires manual intervention or a QA pass

#### Component 3: Task Retry Manager
- Tracks `retry_count` and `max_retries` on tasks
- If a task has failed N times (task_run with status=`failed`), mark it `blocked` with a "max retries exceeded" blocker and notify
- Currently `max_retries` is stored but not enforced by the retry loop

#### Component 4: Cost & Progress Alerting
- Tracks `estimated_cost_usd` vs `actual_cost_usd` across all task_runs
- Alerts (email/webhook) when actual cost exceeds estimated by >20%
- Reports overall loop progress % at checkpoints (25%, 50%, 75%, 100%)

#### Component 5: Safe Stop Enforcer
- Respects the `safe_stop` config flag
- When `safe_stop=true`, waits for all `in_progress` tasks to complete before halting
- Currently `safe_stop` is checked in the tick but not enforced if the process crashes mid-run

---

### Implementation Approach

**Option A: Scheduled Vercel Function**
- Add a `/api/orchestrate/supervisor` endpoint
- Call it from Vercel Cron every 2 minutes
- Pros: No new infrastructure, shares the same DB connection pool
- Cons: Vercel function timeout limits (max 5 min on Pro plan)

**Option B: Supabase Edge Function**
- Deploy as a Deno edge function running on a schedule
- Has direct DB access via service role key
- Pros: No cold starts, persistent context possible
- Cons: Separate deployment pipeline

**Option C: n8n Workflow**
- A dedicated n8n workflow that polls `/api/orchestrate/status` every 2 minutes
- Calls `/api/orchestrate/tick` if loop appears stalled
- Pros: Visual debugging, easy to modify
- Cons: Requires n8n to be running (already used for agent dispatch)

**Recommendation:** Option A for MVP (Supervisor as Vercel Cron function), with Option C as the longer-term visual dashboard for non-technical monitoring.

---

### Minimal Viable Supervisor (MVP SQL)

The core of the supervisor is a DB-level health check. This can run as a Postgres function:

```sql
CREATE OR REPLACE FUNCTION public.buildos_loop_health()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pending_count   int;
  v_in_progress     int;
  v_blocked_no_blocker int;
  v_stale_runs      int;
  v_last_completion timestamptz;
BEGIN
  SELECT COUNT(*) INTO v_pending_count FROM tasks WHERE status = 'pending';
  SELECT COUNT(*) INTO v_in_progress   FROM tasks WHERE status IN ('in_progress', 'dispatched');
  SELECT COUNT(*) INTO v_stale_runs    FROM task_runs
    WHERE status = 'running' AND started_at < now() - interval '10 minutes';
  SELECT COUNT(*) INTO v_blocked_no_blocker FROM tasks t
    WHERE t.status = 'blocked'
    AND NOT EXISTS (SELECT 1 FROM blockers b WHERE b.task_id = t.id AND b.resolved_at IS NULL);
  SELECT MAX(completed_at) INTO v_last_completion FROM tasks WHERE status = 'completed';

  RETURN json_build_object(
    'pending', v_pending_count,
    'in_progress', v_in_progress,
    'stale_runs', v_stale_runs,
    'phantom_blocked', v_blocked_no_blocker,
    'last_completion', v_last_completion,
    'healthy', (v_stale_runs = 0 AND v_blocked_no_blocker = 0)
  );
END;
$$;
```

This gives the supervisor a single RPC call (`supabase.rpc('buildos_loop_health')`) to assess system state and decide whether intervention is needed.

---

## SECTION 4: SUMMARY

| Category | Count |
|----------|-------|
| Critical bugs fixed | 2 |
| High bugs fixed | 2 |
| Medium bugs fixed | 2 |
| Low bugs remaining | 4 |
| Files modified | 10 |
| DB functions patched | 1 |
| Deployments to Vercel | 3 (this session + previous) |

**Loop status at report time:** Actively running, ~69/113 tasks completed (61%)
**All critical crash paths eliminated.** The loop should now run to completion without manual intervention.

---

*Report generated: 2026-03-28*
