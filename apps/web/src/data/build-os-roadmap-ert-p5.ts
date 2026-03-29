/**
 * BUILD OS — ERT-P5 Roadmap
 * Real Delivery & Failure Handling System
 * Seeded via POST /api/projects/[id]/seed-ert-p5
 *
 * ERT-P5 makes the system robust under real-world failure.
 * System must: handle failure explicitly, never get stuck silently,
 * never mislabel failure as success, always provide reason + next action.
 *
 * 7 Workstreams:
 *   A — Failure Taxonomy Engine
 *   B — Task Failure State Machine
 *   C — Retry / Backoff System
 *   D — Operator Intervention Flow
 *   E — Unsupported Task Handling
 *   F — System Health & Failure Dashboard
 *   G — Incident Detection Engine
 *
 * Schema alignment (migration 004):
 *   task_type: code | schema | document | test | review | deploy | design
 *   agent_role: orchestrator | architect | product_analyst | backend_engineer |
 *               frontend_engineer | automation_engineer | integration_engineer |
 *               qa_security_auditor | documentation_engineer | cost_analyst |
 *               recommendation_analyst | release_manager
 *   priority: critical | high | medium | low
 */

import type { RoadmapEpic } from './build-os-roadmap'

// ── 1 Epic · 7 Features · 35 Tasks ───────────────────────────────────────────

export const BUILD_OS_ROADMAP_ERT_P5: RoadmapEpic[] = [
  {
    title:       'ERT-P5 — Real Delivery & Failure Handling System',
    description: 'Makes Build OS robust under real-world failure. Defines a complete failure taxonomy, explicit state machine for failed tasks, exponential retry with caps, operator intervention UI, unsupported task classification, system health dashboard, and automated incident detection.',
    order_index: 0,
    features: [

      // ── WORKSTREAM A: Failure Taxonomy Engine ──────────────────────────────
      {
        title:       'Failure Taxonomy Engine',
        description: 'Define, persist, and surface all failure categories. Every task failure must be classified before it can be retried or escalated. Three top-level types: blocked (dependency or input missing), unsupported (task type cannot be executed by any agent), infra_failure (platform/external-service outage).',
        priority:    'critical',
        order_index: 0,
        tasks: [
          {
            title:              'Design failure taxonomy schema and enums',
            description:        `Create Supabase migration for failure classification infrastructure.

Tables and enums:
1. SQL enum (or check constraints) for failure_category: 'blocked' | 'unsupported' | 'infra_failure' | 'logic_failure' | 'timeout' | 'quota_exceeded' | 'dependency_failed' | 'requires_input' | 'escalated'
2. SQL enum for blocked_reason: 'dependency_not_complete' | 'missing_credential' | 'missing_input' | 'resource_locked' | 'quota_exceeded' | 'rate_limited' | 'manual_hold'
3. SQL enum for unsupported_reason: 'agent_capability_gap' | 'task_type_mismatch' | 'context_insufficient' | 'external_dependency_unavailable' | 'scope_out_of_phase'
4. SQL enum for infra_failure_type: 'n8n_unavailable' | 'anthropic_overloaded' | 'anthropic_quota_exceeded' | 'supabase_error' | 'webhook_timeout' | 'network_error' | 'deploy_failed'

ALTER TABLE tasks ADD COLUMNS:
- failure_category text CHECK (failure_category IN (...enum values...))
- blocked_reason text
- unsupported_reason text
- infra_failure_type text
- failure_detail text (free text, max 1000 chars)
- failure_suggestion text (next action recommendation)
- failed_at timestamptz
- failure_count integer NOT NULL DEFAULT 0

Migration file: migrations/20260329000023_failure_taxonomy.sql
Add indexes on tasks(failure_category), tasks(blocked_reason).`,
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.10,
          },
          {
            title:              'Build failure classification service (lib/failure-classifier.ts)',
            description:        `Create src/lib/failure-classifier.ts — the central authority for classifying any task failure.

Export interface FailureClassification {
  failure_category: FailureCategory
  blocked_reason?: BlockedReason
  unsupported_reason?: UnsupportedReason
  infra_failure_type?: InfraFailureType
  failure_detail: string
  failure_suggestion: string
  is_retryable: boolean
  retry_delay_ms?: number
}

Export function classifyFailure(input: {
  error_message: string
  http_status?: number
  agent_role: string
  task_type: string
  retry_count: number
  max_retries: number
}): FailureClassification

Classification logic:
- 529/503 from Anthropic → infra_failure / anthropic_overloaded / is_retryable: true
- 429 → infra_failure / rate_limited / is_retryable: true with longer delay
- "Execution limit reached" (N8N) → infra_failure / quota_exceeded / is_retryable: false
- timeout (>60s no callback) → infra_failure / webhook_timeout / is_retryable: true
- agent returns 'UNSUPPORTED:*' prefix → unsupported / parse reason
- dependency task status === failed → blocked / dependency_failed / is_retryable: false
- retry_count >= max_retries → escalated / is_retryable: false
- all others → logic_failure / is_retryable: false

Also export function persistFailureClassification(admin, task_id, classification): Promise<void>
— updates tasks table with all failure fields and increments failure_count.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'Integrate failure classifier into supervisor and orchestrator',
            description:        `Modify src/app/api/supervisor/route.ts and src/app/api/orchestrate/tick/route.ts to use classifyFailure on every task_run failure.

In supervisor (stale run cleanup):
- When marking a task_run as failed (auto-cleaned by supervisor), call classifyFailure({ error_message: 'Supervisor timeout — no callback received', http_status: undefined, agent_role, task_type, retry_count, max_retries })
- Call persistFailureClassification to save to tasks table
- Log failure category in the supervisor debug output

In orchestrate/tick (ready task dispatch):
- After a dispatch returns non-200, call classifyFailure on the HTTP error
- Persist before incrementing retry_count

In agent/output (agent callback received with error payload):
- If agent output contains error_type field, map it through classifyFailure
- Persist classification

Import from '@/lib/failure-classifier'.
Do not break existing task state transitions — classification is additive.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        2,
            estimated_cost_usd: 0.22,
          },
          {
            title:              'Failure reason display panels in task card UI',
            description:        `Add failure taxonomy display to the task card component and task detail panel.

In the tasks list page (/projects/[id]/tasks/page.tsx or components/task-card.tsx):
- When task.failure_category is set, show a colored badge:
  - infra_failure → red badge "Infra Failure"
  - unsupported → amber badge "Unsupported"
  - blocked → orange badge "Blocked"
  - logic_failure → red badge "Logic Failure"
  - escalated → purple badge "Escalated"
- Below the badge, show task.failure_detail in a small text block (truncated at 120 chars with tooltip for full text)
- Show task.failure_suggestion in italic text with a lightbulb icon

In task detail panel/modal:
- Full failure taxonomy section: category, sub-type (blocked_reason / infra_failure_type / unsupported_reason), detail text, suggestion
- Show failure_count and failed_at timestamp
- Show "Retry" button if failure_category is retryable (infra_failure with retry < max)
- Show "Mark Unsupported" button if failure_category is logic_failure

Use existing Tailwind + shadcn/ui components. No new dependencies.`,
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.26,
          },
          {
            title:              'QA: Failure taxonomy — classification correctness',
            description:        `QA test suite for the failure classification service and UI display.

Test scenarios for classifyFailure():
1. Input: http_status=529 → expect failure_category='infra_failure', infra_failure_type='anthropic_overloaded', is_retryable=true
2. Input: error_message contains "Execution limit reached" → expect infra_failure_type='quota_exceeded', is_retryable=false
3. Input: retry_count === max_retries → expect failure_category='escalated', is_retryable=false
4. Input: agent returns "UNSUPPORTED: agent_capability_gap" → expect failure_category='unsupported', unsupported_reason='agent_capability_gap'
5. Input: http_status=429 → expect infra_failure, rate_limited, is_retryable=true with retry_delay_ms > 10000
6. Input: unknown error → expect failure_category='logic_failure', is_retryable=false

Test persistFailureClassification:
- Insert a test task, call persist, verify all columns updated in DB
- Verify failure_count increments on repeated calls

UI tests:
- Render task card with failure_category='infra_failure' → verify red badge renders
- Render task card with failure_suggestion set → verify suggestion text appears
- Verify "Retry" button visibility logic (only for retryable failures)`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        4,
            estimated_cost_usd: 0.18,
          },
        ],
      },

      // ── WORKSTREAM B: Task Failure State Machine ───────────────────────────
      {
        title:       'Task Failure State Machine',
        description: 'Explicit state machine governing all failure paths. New states: failed_retryable, failed_permanent, infra_failed, unsupported, requires_input, escalated. No silent loops. Retry limits enforced. Escalation path exists for all failure types.',
        priority:    'critical',
        order_index: 1,
        tasks: [
          {
            title:              'Extend task status enum with failure states',
            description:        `Supabase migration to add new task status values.

Current allowed statuses: pending | ready | dispatched | in_progress | awaiting_review | in_qa | blocked | failed | completed | cancelled

Add to tasks_status_check constraint:
- 'failed_retryable'   — failed but supervisor will retry (infra or transient errors)
- 'failed_permanent'   — failed and will not be retried (logic error, exhausted retries)
- 'infra_failed'       — specific failure class for infrastructure outages
- 'unsupported'        — task cannot be executed by any available agent
- 'requires_input'     — blocked waiting for operator to provide missing data
- 'escalated'          — max retries exhausted, needs human review

Migration: ALTER TABLE tasks DROP CONSTRAINT tasks_status_check; ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending','ready','dispatched','in_progress','awaiting_review','in_qa','blocked','failed','completed','cancelled','failed_retryable','failed_permanent','infra_failed','unsupported','requires_input','escalated'));

Also update the isValidTransition() function in src/lib/execution.ts to include all valid transitions involving the new states:
- failed → failed_retryable (supervisor decides to retry)
- failed → failed_permanent (retry_count >= max_retries)
- failed → infra_failed (infra classifier)
- failed → unsupported (agent signals unsupported)
- failed → requires_input (missing input detected)
- failed_retryable → ready (supervisor resets for retry)
- infra_failed → ready (manual unblock or auto-retry after delay)
- requires_input → ready (operator provides input)
- escalated → ready (operator manually resets)
- any → escalated (max retries hit)`,
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.10,
          },
          {
            title:              'Build failure state machine service (lib/task-state-machine.ts)',
            description:        `Create src/lib/task-state-machine.ts — manages all state transitions for failed tasks.

Export enum TaskStatus (all values including new ones)

Export interface StateTransitionResult {
  success: boolean
  new_status: TaskStatus
  failure_category?: FailureCategory
  reason: string
}

Export async function applyFailureTransition(
  admin: SupabaseClient,
  task_id: string,
  classification: FailureClassification,
  current_retry_count: number,
  max_retries: number
): Promise<StateTransitionResult>

Logic:
- If is_retryable AND current_retry_count < max_retries → set status='failed_retryable', schedule retry
- If failure_category === 'infra_failure' AND is_retryable → set status='infra_failed'
- If failure_category === 'unsupported' → set status='unsupported' (permanent, no retry)
- If failure_category === 'requires_input' → set status='requires_input'
- If current_retry_count >= max_retries → set status='escalated'
- Otherwise → set status='failed_permanent'

Also export:
- resetForRetry(admin, task_id): Promise<void> — sets status='ready', zeroes dispatched_at, preserves failure history
- markEscalated(admin, task_id, reason): Promise<void>
- markUnsupported(admin, task_id, reason, suggestion): Promise<void>

Persist state changes with a single DB update that sets status + failure fields atomically.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.25,
          },
          {
            title:              'QA: State machine — transition exhaustiveness and correctness',
            description:        `QA verification for the task failure state machine.

Test applyFailureTransition():
1. Infra failure, retry_count=0, max_retries=3 → expect 'infra_failed', is_retryable=true
2. Logic failure, retry_count=0, max_retries=3 → expect 'failed_permanent', is_retryable=false
3. Unsupported signal → expect 'unsupported', no retry ever scheduled
4. retry_count=3, max_retries=3 (any failure) → expect 'escalated'
5. requires_input signal → expect 'requires_input'
6. failed_retryable → resetForRetry → verify status='ready' and dispatched_at=NULL

Test isValidTransition():
- Enumerate all new state pairs and verify they are in the allowed transitions
- Verify escalated → ready is ALLOWED (operator manual reset)
- Verify unsupported → ready is ALLOWED (operator override)
- Verify completed → any_failure_state is BLOCKED

Test atomicity:
- Simulate concurrent state update attempts, verify last-write-wins is safe (optimistic lock)`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.16,
          },
        ],
      },

      // ── WORKSTREAM C: Retry / Backoff System ──────────────────────────────
      {
        title:       'Retry / Backoff System',
        description: 'Exponential retry with caps. Retry reason logging distinguishing infra vs logic retries. N8N retry configuration for Anthropic 529/429. Backend retry scheduling with supervisor coordination. Retry state is visible and auditable.',
        priority:    'critical',
        order_index: 2,
        tasks: [
          {
            title:              'Design retry_logs table and backoff schema',
            description:        `Create Supabase migration for retry audit trail.

CREATE TABLE retry_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_run_id       uuid REFERENCES task_runs(id) ON DELETE SET NULL,
  attempt_number    integer NOT NULL,
  retry_type        text NOT NULL CHECK (retry_type IN ('infra', 'logic', 'manual', 'supervisor')),
  failure_category  text,
  error_message     text,
  delay_ms          integer NOT NULL DEFAULT 0,
  next_retry_at     timestamptz,
  triggered_by      text NOT NULL DEFAULT 'supervisor',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_retry_logs_task_id    ON retry_logs(task_id);
CREATE INDEX idx_retry_logs_project_id ON retry_logs(project_id);
CREATE INDEX idx_retry_logs_created_at ON retry_logs(created_at);

ALTER TABLE retry_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY retry_logs_project_access ON retry_logs FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
);

Also add to tasks table: next_retry_at timestamptz, retry_type text (last retry type).

Migration file: migrations/20260329000024_retry_logs.sql`,
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.09,
          },
          {
            title:              'Build exponential backoff retry service (lib/retry-scheduler.ts)',
            description:        `Create src/lib/retry-scheduler.ts.

Export interface RetryDecision {
  should_retry: boolean
  retry_type: 'infra' | 'logic' | 'manual' | 'supervisor'
  delay_ms: number
  next_retry_at: Date
  reason: string
}

Export function computeRetryDecision(
  classification: FailureClassification,
  attempt_number: number,
  max_retries: number
): RetryDecision

Backoff formula:
- Base delay: 5_000ms (5s)
- Infra failures: exponential → base * 2^(attempt-1) capped at 120_000ms (2 min)
  - attempt 1: 5s, attempt 2: 10s, attempt 3: 20s
- Logic failures: not retried (should_retry=false)
- Quota exceeded: flat 300_000ms (5 min) — quota resets are time-based
- Rate limited: flat 15_000ms (15s) then exponential

Export async function scheduleRetry(
  admin: SupabaseClient,
  task_id: string,
  task_run_id: string | null,
  decision: RetryDecision,
  attempt_number: number
): Promise<void>
— inserts retry_log row
— updates tasks.next_retry_at and tasks.retry_type
— sets tasks.status = 'failed_retryable' if should_retry, else 'failed_permanent'

Supervisor integration: in orchestrate/tick, include tasks WHERE (status='failed_retryable' AND next_retry_at <= now()) as eligible for re-dispatch by setting them to 'ready'.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.24,
          },
          {
            title:              'Add retry eligibility to orchestration tick',
            description:        `Modify src/app/api/orchestrate/tick/route.ts to pick up failed_retryable tasks whose retry window has passed.

Current tick query selects tasks WHERE status='ready'. Add a second query:
SELECT id, retry_count, max_retries, failure_category FROM tasks
WHERE project_id = $1
  AND status = 'failed_retryable'
  AND next_retry_at IS NOT NULL
  AND next_retry_at <= now()
  AND retry_count < max_retries
LIMIT 10

For each matching task:
1. Set status = 'ready' (resetForRetry)
2. Clear dispatched_at
3. Log: "[tick] Resetting failed_retryable task {id} for retry attempt {n}"
4. Include in the normal dispatch queue for this tick

Also: tasks WHERE status='infra_failed' AND next_retry_at <= now() should be treated the same way (auto-retry after infra outage).

Ensure idempotency: if a task is picked up for retry but dispatch fails again, the failure classifier re-runs and sets a new next_retry_at.

Add unit test scenario in the tick endpoint comments.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.18,
          },
          {
            title:              'QA: Retry backoff — delay math, caps, and log persistence',
            description:        `QA test suite for retry scheduler and backoff logic.

Test computeRetryDecision():
1. Infra failure attempt 1 → delay_ms = 5000
2. Infra failure attempt 2 → delay_ms = 10000
3. Infra failure attempt 3 → delay_ms = 20000
4. Quota exceeded (any attempt) → delay_ms = 300000
5. Logic failure → should_retry = false
6. attempt_number >= max_retries → should_retry = false regardless of type

Test scheduleRetry():
- Insert task, call scheduleRetry, verify retry_logs row created with correct fields
- Verify tasks.next_retry_at = now() + delay_ms (within 1s tolerance)
- Verify tasks.status = 'failed_retryable' for retryable, 'failed_permanent' for non-retryable

Test tick integration:
- Seed a task with status='failed_retryable' and next_retry_at = now()-1s
- Trigger tick endpoint
- Verify task status transitions to 'ready' within the tick cycle
- Verify no duplicate retry_log rows (idempotency)`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.17,
          },
        ],
      },

      // ── WORKSTREAM D: Operator Intervention Flow ───────────────────────────
      {
        title:       'Operator Intervention Flow',
        description: 'UI and API for operators to manually intervene on stuck or failed tasks. Actions: unblock, retry, mark-unsupported, provide-input. Every action is audited. The UI must be accessible from the tasks page and task detail without navigating away.',
        priority:    'high',
        order_index: 3,
        tasks: [
          {
            title:              'Operator intervention API endpoints',
            description:        `Create src/app/api/tasks/[id]/intervene/route.ts.

POST /api/tasks/[id]/intervene
Body: { action: 'unblock' | 'retry' | 'mark_unsupported' | 'provide_input', reason?: string, input_data?: Record<string,unknown>, suggestion?: string }

Actions:
1. 'unblock': set status='ready', clear failure fields, log to audit. Allowed from: blocked, requires_input, escalated, failed_permanent, infra_failed, unsupported
2. 'retry': set status='ready', reset retry_count to 0, clear dispatched_at, insert retry_log with retry_type='manual'. Allowed from: any failed state
3. 'mark_unsupported': set status='unsupported', set failure_category='unsupported', set unsupported_reason from body.reason, set failure_suggestion from body.suggestion. Allowed from: any non-completed state
4. 'provide_input': merge body.input_data into tasks.context_payload, set status='ready'. Allowed from: requires_input

Auth: require user JWT (no internal secret — operator action only)
Response: { success: true, task_id, previous_status, new_status, action, actor_user_id, timestamp }

Write audit log for every intervention using writeAuditLog().
Return 422 if action is not valid for current task status.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Operator intervention panel — React component',
            description:        `Create src/components/operator-intervention-panel.tsx.

Props: { task: Task, onInterventionComplete: () => void }

Render a panel (slide-over or inline card) with:
1. Current failure summary: status badge + failure_category + failure_detail text
2. failure_suggestion displayed prominently with lightbulb icon
3. Action buttons (shown conditionally based on task status):
   - "Force Retry" (shown for: failed_retryable, failed_permanent, escalated, infra_failed) → calls POST /api/tasks/[id]/intervene {action:'retry'}
   - "Unblock" (shown for: blocked, requires_input) → calls POST with {action:'unblock'}
   - "Mark Unsupported" (shown for: logic_failure, failed_permanent) → opens mini-form for reason + suggestion, then calls {action:'mark_unsupported'}
   - "Provide Input" (shown for: requires_input) → opens JSON input textarea, calls {action:'provide_input', input_data: parsedJSON}
4. Retry history: show last 3 retry_log entries for this task (attempt number, retry_type, delay, created_at)
5. Loading states and error handling for each action

Use existing Tailwind + shadcn/ui components. Import task type from '@/types'. Add "Intervene" button to task card that opens this panel.`,
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'QA: Intervention API — action guards and audit trail',
            description:        `QA test suite for operator intervention API.

Test action guards:
1. Unblock on status='completed' → expect 422 (invalid transition)
2. Retry on status='pending' → expect 422
3. mark_unsupported on status='in_progress' → expect 422 (task is running)
4. provide_input on status='failed_permanent' → expect 422 (not in requires_input)

Test valid transitions:
1. POST {action:'retry'} on task with status='escalated' → expect 200, task.status='ready', retry_count reset, retry_log created
2. POST {action:'unblock'} on task with status='requires_input' → expect 200, task.status='ready'
3. POST {action:'mark_unsupported', reason:'agent_capability_gap', suggestion:'Use external API'} → expect task.status='unsupported', failure fields set
4. POST {action:'provide_input', input_data:{api_key:'xxx'}} → expect context_payload merged, status='ready'

Test audit:
- Every intervention creates an audit_log row with event_type='TASK_COMPLETED', action='execute', metadata containing the intervention action name`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.16,
          },
        ],
      },

      // ── WORKSTREAM E: Unsupported Task Handling ────────────────────────────
      {
        title:       'Unsupported Task Handling',
        description: 'When a task cannot be executed by any agent, it must be marked unsupported with a structured reason and actionable suggestion. The agent signals unsupported via a prefix in its output. The system catches the signal, persists classification, and surfaces it in the UI without retrying.',
        priority:    'high',
        order_index: 4,
        tasks: [
          {
            title:              'Agent unsupported signal protocol and output parser',
            description:        `Define and implement the UNSUPPORTED signal protocol for agent outputs.

Protocol: When an agent cannot complete a task, it returns output starting with:
"UNSUPPORTED:<reason_code>:<suggestion_text>"

Where reason_code is one of: agent_capability_gap | task_type_mismatch | context_insufficient | external_dependency_unavailable | scope_out_of_phase

Create src/lib/agent-output-parser.ts (or extend existing parser):
Export function parseUnsupportedSignal(output: string): { is_unsupported: boolean, reason_code?: UnsupportedReason, suggestion?: string }

In the agent output handler (src/app/api/agent/output/route.ts):
- Before processing output as a successful result, call parseUnsupportedSignal
- If is_unsupported=true:
  1. Call classifyFailure with failure_category='unsupported'
  2. Call markUnsupported(admin, task_id, reason_code, suggestion)
  3. Set task.status = 'unsupported'
  4. Do NOT increment retry_count
  5. Return { classified: 'unsupported', reason: reason_code } in response
- Log: "[agent/output] Task {id} classified as unsupported: {reason_code}"

Add the UNSUPPORTED prefix handling to the N8N workflow Parse AI Response node: if response starts with "UNSUPPORTED:", include a field unsupported_signal: true in the callback payload.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Unsupported task display — reason + suggestion chips in UI',
            description:        `Extend the task card and task list page to properly render unsupported tasks.

In task card component (add to the failure reason display panel from Workstream A):
- For status='unsupported': show amber background chip labeled "Unsupported"
- Show unsupported_reason as a human-readable label:
  - 'agent_capability_gap' → "Agent cannot perform this task type"
  - 'task_type_mismatch' → "Task type doesn't match agent role"
  - 'context_insufficient' → "Insufficient context to proceed"
  - 'external_dependency_unavailable' → "Required external service unavailable"
  - 'scope_out_of_phase' → "Out of scope for current phase"
- Show failure_suggestion with a "Suggested action:" prefix and right-arrow icon
- Show "Mark Supported & Retry" button (calls intervene API with action:'retry') — for cases where operator has manually resolved the blocker
- Unsupported tasks must be excluded from "ready to dispatch" counts in project dashboard
- Add filter option in task list: "Show unsupported" toggle (default: hidden from normal view)

In the project health summary component: add "Unsupported tasks: N" count chip.`,
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.22,
          },
          {
            title:              'QA: Unsupported handling — no retry, correct display, signal parsing',
            description:        `QA test suite for unsupported task handling.

Test parseUnsupportedSignal():
1. Input "UNSUPPORTED:agent_capability_gap:Use a human developer" → expect is_unsupported=true, reason_code='agent_capability_gap', suggestion='Use a human developer'
2. Input "UNSUPPORTED:context_insufficient:" (empty suggestion) → expect is_unsupported=true, suggestion=''
3. Input "This task is complex..." (no prefix) → expect is_unsupported=false
4. Input "unsupported:..." (lowercase) → expect is_unsupported=false (case sensitive)

Test agent/output handler:
1. POST agent output starting with UNSUPPORTED: prefix → verify task.status='unsupported', retry_count unchanged, no retry_log created
2. Verify task.unsupported_reason set correctly
3. Verify task.failure_suggestion set from signal

Test UI render:
1. Task with status='unsupported' → verify amber "Unsupported" badge rendered
2. Verify "Mark Supported & Retry" button is present
3. Verify unsupported tasks excluded from dispatch-eligible count`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.15,
          },
        ],
      },

      // ── WORKSTREAM F: System Health & Failure Dashboard ────────────────────
      {
        title:       'System Health & Failure Dashboard',
        description: 'Real-time visibility into failure rates, retry metrics, blocked task counts, and infra vs logic failure split. Operators can see system health at a glance and drill into specific failure categories. Data is sourced from tasks and retry_logs tables with aggregation.',
        priority:    'high',
        order_index: 5,
        tasks: [
          {
            title:              'System health API endpoint',
            description:        `Create src/app/api/projects/[id]/health/route.ts.

GET /api/projects/[id]/health?window=1h|6h|24h|7d (default: 24h)

Response:
{
  window: '24h',
  summary: {
    total_tasks: number,
    completed: number,
    failed_permanent: number,
    failed_retryable: number,
    infra_failed: number,
    unsupported: number,
    escalated: number,
    requires_input: number,
    blocked: number,
    failure_rate_pct: number,        // (failed_permanent + escalated) / total * 100
    retry_rate_pct: number,          // tasks_with_retry_count > 0 / total * 100
  },
  failure_breakdown: {
    by_category: Record<FailureCategory, number>,
    by_agent_role: Record<AgentRole, { total: number, failed: number, rate_pct: number }>,
    top_errors: Array<{ message: string, count: number }>,
  },
  retry_metrics: {
    total_retries: number,
    infra_retries: number,
    logic_retries: number,
    manual_retries: number,
    avg_retries_per_failed_task: number,
    tasks_that_recovered: number,   // went failed_retryable → completed
  },
  infra_health: {
    n8n_quota_status: 'ok' | 'warning' | 'critical',
    anthropic_error_rate_pct: number,
    webhook_timeout_count: number,
  }
}

Query data from tasks + retry_logs tables filtered by project_id and created_at window. Auth: internal secret or user JWT.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.22,
          },
          {
            title:              'Failure dashboard page — metrics and visualizations',
            description:        `Create src/app/(app)/projects/[id]/health/page.tsx.

Page layout:
1. Header: "System Health" with last-updated timestamp and refresh button. Time window selector (1h / 6h / 24h / 7d).

2. Summary stat cards (row of 4):
   - Failure Rate % (red if >20%, amber if >10%, green if <10%)
   - Retry Rate %
   - Escalated Tasks count
   - Unsupported Tasks count

3. Failure breakdown by category:
   - Horizontal bar chart (use recharts BarChart): x=count, y=failure_category
   - Color coding: infra=blue, logic=red, unsupported=amber, escalated=purple

4. Failed tasks by agent role: table with columns (Agent Role, Total, Failed, Failure Rate %). Sort by failure rate desc.

5. Retry metrics section:
   - Infra retries vs logic retries (pie chart)
   - "Tasks that recovered" count with green badge

6. Blocked tasks list:
   - Table: task title, status, blocked_reason, failed_at, action button → opens operator intervention panel

Add link to this page in project sidebar nav as "Health" with a heart/pulse icon. Use existing Tailwind + recharts (already in project).`,
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.30,
          },
          {
            title:              'QA: Health dashboard — data accuracy and rendering',
            description:        `QA test suite for the health endpoint and dashboard.

Test health API data accuracy:
1. Seed 10 tasks: 4 completed, 2 failed_permanent, 2 infra_failed, 1 unsupported, 1 escalated
2. Call GET /health → verify:
   - summary.completed = 4
   - summary.failure_rate_pct = 30 (3 failures / 10 total * 100)
   - failure_breakdown.by_category['infra_failure'] = 2
   - failure_breakdown.by_category['unsupported'] = 1

3. Seed 3 retry_log rows for one task → verify retry_metrics.total_retries = 3

Test time window filtering:
- Insert a task failed 25h ago
- Call GET /health?window=24h → verify this task NOT included
- Call GET /health?window=7d → verify this task IS included

Test UI rendering:
- Mock health API response with high failure rate (>20%) → verify stat card shows red
- Verify recharts BarChart renders for failure breakdown
- Verify blocked tasks list shows "Intervene" button for each row`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.16,
          },
        ],
      },

      // ── WORKSTREAM G: Incident Detection Engine ───────────────────────────
      {
        title:       'Incident Detection Engine',
        description: 'Automated detection of systemic failures: repeated task failures, stuck loops, infra outages, quota exhaustion. Detected incidents are classified, persisted in a system_incidents table, and surfaced as alerts in the dashboard. Replaces manual monitoring of N8N execution logs.',
        priority:    'high',
        order_index: 6,
        tasks: [
          {
            title:              'Design system_incidents table and incident detection schema',
            description:        `Create Supabase migration for incident tracking infrastructure.

CREATE TABLE system_incidents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE,
  incident_type     text NOT NULL CHECK (incident_type IN (
    'repeated_task_failure', 'stuck_loop', 'infra_outage',
    'quota_exhaustion', 'high_failure_rate', 'escalation_surge'
  )),
  severity          text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title             text NOT NULL,
  description       text,
  affected_task_ids uuid[] DEFAULT '{}',
  metadata          jsonb DEFAULT '{}',
  detected_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_incidents_project    ON system_incidents(project_id);
CREATE INDEX idx_system_incidents_type       ON system_incidents(incident_type);
CREATE INDEX idx_system_incidents_status     ON system_incidents(status);
CREATE INDEX idx_system_incidents_detected   ON system_incidents(detected_at);

ALTER TABLE system_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidents_project_access ON system_incidents FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
);

Migration file: migrations/20260329000025_system_incidents.sql`,
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.09,
          },
          {
            title:              'Build incident detection service (lib/incident-detector.ts)',
            description:        `Create src/lib/incident-detector.ts.

Export async function runIncidentDetection(admin: SupabaseClient, project_id: string): Promise<SystemIncident[]>

Detection checks (run in parallel):

1. REPEATED_TASK_FAILURE: Any single task with failure_count >= 3 in the last 2 hours
   → severity: high, title: "Task {title} has failed {n} times", affected_task_ids: [task_id]

2. STUCK_LOOP: Tasks with status='failed_retryable' and next_retry_at < now()-30min (retry window passed but never picked up)
   → severity: medium, likely indicates supervisor is not running

3. INFRA_OUTAGE: >= 3 tasks with infra_failure_type in ('anthropic_overloaded','n8n_unavailable','webhook_timeout') in last 15 min
   → severity: critical

4. QUOTA_EXHAUSTION: Any task with infra_failure_type='quota_exceeded' created in last 1 hour
   → severity: critical

5. HIGH_FAILURE_RATE: failure_rate > 50% across project tasks in last hour
   → severity: high

6. ESCALATION_SURGE: >= 5 tasks escalated in last 30 minutes
   → severity: high

Idempotency: before inserting a new incident, check if an open incident of the same type already exists for the project → skip if found (avoid duplicate alerts).

Insert detected incidents into system_incidents table.
Return array of newly created incidents.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.26,
          },
          {
            title:              'N8N quota canary watchdog endpoint',
            description:        `Create src/app/api/orchestrate/watchdog/n8n-canary/route.ts.

POST /api/orchestrate/watchdog/n8n-canary (called by Vercel cron or manual trigger)

Steps:
1. Check system_incidents for open incident with incident_type='quota_exhaustion' from last 30 min — if found, skip (already detected)
2. Query N8N API: GET https://{N8N_HOST}/api/v1/executions?status=error&limit=5
   Headers: X-N8N-API-KEY: {N8N_API_KEY} (env var)
3. For each execution in the response:
   - If error message contains "Execution limit reached" or "quota" (case-insensitive):
     - Create system_incident: type='quota_exhaustion', severity='critical', title='N8N execution quota exhausted', metadata: { execution_id, error }
     - Return { status: 'quota_exhausted', incident_id }
4. Also check: If N8N API is unreachable (network error or 401):
   - Create incident: type='infra_outage', severity='critical', metadata: { n8n_api_unreachable: true }
5. Log result: "[watchdog] N8N canary check: {status}"
6. Return { status: 'ok' | 'quota_exhausted' | 'n8n_unreachable', checked_at }

Required env var: N8N_API_KEY (add to .env.example)
Add to vercel.json crons: { "path": "/api/orchestrate/watchdog/n8n-canary", "schedule": "*/15 * * * *" }`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.16,
          },
          {
            title:              'Integrate incident detection into orchestration tick',
            description:        `Modify src/app/api/orchestrate/tick/route.ts to run incident detection on every tick.

After the normal task dispatch cycle completes (end of tick handler):
1. Call runIncidentDetection(admin, project_id)
2. If any new incidents returned:
   - Log each: "[tick] Incident detected: {incident_type} / {severity} — {title}"
   - For CRITICAL severity incidents: also log to a dedicated error channel (console.error with structured JSON for log aggregation)
3. Do NOT block the tick on incident detection failure — wrap in try/catch, log any errors

Also: expose incidents in GET /api/orchestrate/tick?project_id=... response:
Add to response body: { ..., open_incidents: number, critical_incidents: number }

This gives the caller (monitoring scripts, dashboard polling) immediate visibility.

Add incidents count to the tick response that's already returned so no additional API round trip is needed for the health dashboard.`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.14,
          },
          {
            title:              'QA: Incident detection — trigger conditions and deduplication',
            description:        `QA test suite for the incident detection engine.

Test each detection condition:
1. REPEATED_TASK_FAILURE: Insert task with failure_count=3, created in last 2h → expect incident created with severity='high'
2. STUCK_LOOP: Insert task with status='failed_retryable', next_retry_at = 1h ago → expect incident type='stuck_loop'
3. INFRA_OUTAGE: Insert 3 tasks with infra_failure_type='anthropic_overloaded' in last 15min → expect incident type='infra_outage', severity='critical'
4. QUOTA_EXHAUSTION: Insert task with infra_failure_type='quota_exceeded' 30min ago → expect incident type='quota_exhaustion'
5. HIGH_FAILURE_RATE: 6/10 tasks in last hour failed → expect incident type='high_failure_rate'

Test deduplication:
- Insert open incident type='infra_outage' → run detection → verify NO second incident created
- Resolve the incident → run detection again with same conditions → verify new incident IS created

Test N8N canary:
- Mock N8N API response with "Execution limit reached" error → verify incident created
- Mock N8N API returning 401 → verify 'n8n_unreachable' incident created

Test tick integration:
- Run tick → verify response includes open_incidents count`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        4,
            estimated_cost_usd: 0.18,
          },
        ],
      },
    ],
  },
]

export const ROADMAP_ERT_P5_SUMMARY = {
  phase:                    5,
  total_epics:              1,
  total_features:           7,
  total_tasks:              35,
  workstreams:              ['A: Failure Taxonomy', 'B: State Machine', 'C: Retry/Backoff', 'D: Operator Intervention', 'E: Unsupported Handling', 'F: Health Dashboard', 'G: Incident Detection'],
  total_estimated_cost_usd: 4.68,
  be_tasks:                 19,
  fe_tasks:                 8,
  qa_tasks:                 8,
}
