/**
 * Build OS — Execution Engine Utilities
 * Core helpers shared across the task execution pipeline.
 * All operations must be idempotent, locked, and audited.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Idempotency ─────────────────────────────────────────────────────────────

/**
 * Check idempotency before executing an operation.
 * Returns { isDuplicate, existingResponse } if already processed.
 * Returns { isDuplicate: false } if safe to proceed.
 */
export async function checkIdempotency(
  admin: SupabaseClient,
  key: string,
  operation: string
): Promise<{ isDuplicate: boolean; cachedResponse?: unknown; status?: string }> {
  const { data, error } = await admin.rpc('buildos_check_idempotency', {
    p_idempotency_key: key,
    p_operation: operation,
  })

  if (error || !data) return { isDuplicate: false }

  const result = data as { found: boolean; status: string; cached_response?: unknown }
  if (result.found && result.status === 'completed') {
    return { isDuplicate: true, cachedResponse: result.cached_response, status: result.status }
  }
  if (result.found && result.status === 'processing') {
    return { isDuplicate: true, status: 'processing' }
  }
  return { isDuplicate: false }
}

/**
 * Mark an idempotency key as completed with the response body.
 */
export async function completeIdempotency(
  admin: SupabaseClient,
  key: string,
  operation: string,
  response: unknown,
  success: boolean
) {
  await admin.rpc('buildos_complete_idempotency', {
    p_idempotency_key: key,
    p_operation: operation,
    p_response_body: response,
    p_success: success,
  })
}

/**
 * Mark an idempotency key as "processing" (in-flight).
 */
export async function markIdempotencyProcessing(
  admin: SupabaseClient,
  key: string,
  operation: string,
  userId: string
) {
  await admin.from('idempotency_keys').upsert(
    {
      idempotency_key: key,
      operation,
      user_id: userId,
      status: 'processing',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'idempotency_key,operation', ignoreDuplicates: false }
  )
}

// ─── Resource Locking ─────────────────────────────────────────────────────────

/**
 * Acquire an exclusive lock on a resource.
 * Returns { acquired: true, lockId } or { acquired: false, reason }.
 */
export async function acquireLock(
  admin: SupabaseClient,
  resourceType: string,
  resourceId: string,
  taskRunId: string,
  ttlSeconds = 300
): Promise<{ acquired: boolean; lockId?: string; reason?: string }> {
  const { data, error } = await admin.rpc('buildos_acquire_lock', {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_lock_type: 'exclusive',
    p_locked_by_run: taskRunId,
    p_duration_minutes: Math.ceil(ttlSeconds / 60),
  })

  if (error) {
    return { acquired: false, reason: error.message }
  }

  const result = data as { success: boolean; lock_id?: string; reason?: string }
  return {
    acquired: result.success,
    lockId: result.lock_id,
    reason: result.reason,
  }
}

/**
 * Release a lock by ID.
 */
export async function releaseLock(admin: SupabaseClient, lockId: string) {
  await admin.rpc('buildos_release_lock', { p_lock_id: lockId })
}

// ─── Audit Logging ───────────────────────────────────────────────────────────

export type AuditEventType =
  | 'task_dispatched' | 'task_completed' | 'task_failed' | 'task_blocked'
  | 'agent_output_received' | 'qa_verdict_submitted' | 'blocker_created'
  | 'cost_event_emitted' | 'credential_created' | 'credential_deleted'
  | 'document_created' | 'release_check_run' | 'project_status_changed'

// Map internal event types to DB-constrained values.
// DB CHECK constraint: action IN ('create','read','update','delete','execute','approve','reject','rotate','lock','unlock')
// DB CHECK constraint: event_type IN ('TASK_DISPATCHED','TASK_COMPLETED','TASK_FAILED','TASK_BLOCKED',
//   'QA_VERDICT_ISSUED','RELEASE_APPROVED','RELEASE_DEPLOYED','RELEASE_ROLLED_BACK',
//   'CREDENTIAL_ACCESS','CREDENTIAL_CREATED','CREDENTIAL_REVOKED','CREDENTIAL_DECRYPT_FAILED',
//   'KEY_ROTATION','BREAK_GLASS','LOCK_ACQUIRED','LOCK_RELEASED','LOCK_FORCE_RELEASED',
//   'INTEGRATION_CONNECTED','INTEGRATION_FAILED','COST_ALERT_TRIGGERED',
//   'USER_ROLE_CHANGED','PROJECT_CREATED','PROJECT_ARCHIVED',
//   'BLUEPRINT_ACCEPTED','RELEASE_GATE_PASSED','RELEASE_GATE_FAILED')
const AUDIT_EVENT_MAP: Record<AuditEventType, { dbEvent: string; action: string }> = {
  task_dispatched:        { dbEvent: 'TASK_DISPATCHED',      action: 'execute' },
  task_completed:         { dbEvent: 'TASK_COMPLETED',       action: 'update'  },
  task_failed:            { dbEvent: 'TASK_FAILED',          action: 'update'  },
  task_blocked:           { dbEvent: 'TASK_BLOCKED',         action: 'update'  },
  agent_output_received:  { dbEvent: 'TASK_COMPLETED',       action: 'execute' },
  qa_verdict_submitted:   { dbEvent: 'QA_VERDICT_ISSUED',    action: 'approve' },
  blocker_created:        { dbEvent: 'TASK_BLOCKED',         action: 'create'  },
  cost_event_emitted:     { dbEvent: 'COST_ALERT_TRIGGERED', action: 'create'  },
  credential_created:     { dbEvent: 'CREDENTIAL_CREATED',   action: 'create'  },
  credential_deleted:     { dbEvent: 'CREDENTIAL_REVOKED',   action: 'delete'  },
  document_created:       { dbEvent: 'PROJECT_CREATED',      action: 'create'  },
  release_check_run:      { dbEvent: 'RELEASE_GATE_PASSED',  action: 'execute' },
  project_status_changed: { dbEvent: 'PROJECT_ARCHIVED',     action: 'update'  },
}

export async function writeAuditLog(
  admin: SupabaseClient,
  params: {
    event_type: AuditEventType
    actor_user_id?: string
    actor_agent_role?: string
    project_id?: string
    resource_type: string
    resource_id: string
    old_value?: Record<string, unknown>
    new_value?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
) {
  try {
    // Resolve workspace_id and organization_id from project
    // DB function requires both as non-nullable UUIDs
    let workspace_id: string | null = null
    let organization_id: string | null = null

    if (params.project_id) {
      const { data: project } = await admin
        .from('projects')
        .select('workspace_id')
        .eq('id', params.project_id)
        .single()
      if (project?.workspace_id) {
        workspace_id = project.workspace_id
        const { data: workspace } = await admin
          .from('workspaces')
          .select('organization_id')
          .eq('id', workspace_id)
          .single()
        if (workspace?.organization_id) {
          organization_id = workspace.organization_id
        }
      }
    }

    // Fall back to first available workspace/org if project lookup failed
    if (!workspace_id || !organization_id) {
      const { data: ws } = await admin
        .from('workspaces')
        .select('id, organization_id')
        .limit(1)
        .single()
      workspace_id = ws?.id ?? null
      organization_id = ws?.organization_id ?? null
    }

    if (!workspace_id || !organization_id) {
      // Cannot write audit log without org/workspace context — skip silently
      return
    }

    // Resolve actor_id and actor_type from the legacy params
    const actor_id = params.actor_user_id || params.actor_agent_role || 'system'
    const actor_type = params.actor_user_id ? 'user' : params.actor_agent_role ? 'agent' : 'system'

    const mapped = AUDIT_EVENT_MAP[params.event_type] ?? { dbEvent: 'TASK_COMPLETED', action: 'execute' }

    const { error } = await admin.rpc('buildos_write_audit_log', {
      p_organization_id: organization_id,
      p_workspace_id: workspace_id,
      p_project_id: params.project_id || null,
      p_actor_id: actor_id,
      p_actor_type: actor_type,
      p_event_type: mapped.dbEvent,
      p_resource_type: params.resource_type,
      p_resource_id: params.resource_id,
      p_action: mapped.action,
      p_before_state: params.old_value ?? null,
      p_after_state: params.new_value ?? null,
      p_metadata: params.metadata ?? {},
    })

    if (error) {
      console.error('[writeAuditLog] RPC error:', error.message)
    }
  } catch (err) {
    // Audit log is non-fatal — never let it crash the caller
    console.error('[writeAuditLog] Unexpected error:', err)
  }
}

// ─── Agent Output Schema Validation ──────────────────────────────────────────

/**
 * Validate agent output against the jsonb_output_schemas for that task_type.
 * Returns { valid, errors }.
 */
export function validateAgentOutput(
  outputType: string,
  output: unknown
): { valid: boolean; errors: string[] } {
  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be a non-null object'] }
  }

  const obj = output as Record<string, unknown>
  const errors: string[] = []

  // Type-specific validation rules matching migration 012 jsonb_output_schemas seeds
  switch (outputType) {
    case 'code':
      if (!obj.files || !Array.isArray(obj.files)) errors.push('code output must have files[]')
      if (!obj.language)                            errors.push('code output must have language')
      break
    case 'schema':
      if (!obj.tables || !Array.isArray(obj.tables)) errors.push('schema output must have tables[]')
      break
    case 'document':
      if (!obj.content || typeof obj.content !== 'string') errors.push('document output must have content string')
      if (!obj.format)                                     errors.push('document output must have format')
      break
    case 'test':
      if (!obj.test_cases || !Array.isArray(obj.test_cases)) errors.push('test output must have test_cases[]')
      break
    case 'review':
      if (!obj.findings || !Array.isArray(obj.findings)) errors.push('review output must have findings[]')
      if (typeof obj.approved !== 'boolean')             errors.push('review output must have approved boolean')
      break
    case 'handoff':
      if (!obj.summary || typeof obj.summary !== 'string') errors.push('handoff output must have summary string')
      if (!obj.next_tasks || !Array.isArray(obj.next_tasks)) errors.push('handoff output must have next_tasks[]')
      break
    case 'qa_verdict':
      if (typeof obj.passed !== 'boolean') errors.push('qa_verdict output must have passed boolean')
      if (!obj.checks || !Array.isArray(obj.checks)) errors.push('qa_verdict output must have checks[]')
      break
    default:
      // Unknown type — allow pass-through
      break
  }

  return { valid: errors.length === 0, errors }
}

// ─── Task Run State Machine ───────────────────────────────────────────────────
//
// SHADOW MODE NOTE:
// The "blocked" state can be set non-authoritatively when a shadow (Railway)
// execution fails before the primary (n8n) execution completes. In that scenario,
// the primary's success callback must be able to override the blocked state.
//
// This is handled in /api/agent/output via isShadowRaceRecovery — which bypasses
// isValidTransition and forces blocked → awaiting_review directly. Do NOT add
// blocked → awaiting_review to the general transition map; that would allow any
// code path to unblock a task, including legitimate failure states.

export const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:         ['ready', 'cancelled'],
  ready:           ['dispatched', 'cancelled'],
  dispatched:      ['in_progress', 'awaiting_review', 'failed', 'blocked'],
  in_progress:     ['awaiting_review', 'blocked', 'failed'],
  awaiting_review: ['in_qa', 'in_progress', 'blocked'],
  in_qa:           ['completed', 'in_progress', 'blocked'],
  blocked:         ['ready', 'cancelled'],
  failed:          ['ready', 'cancelled'],
  completed:       [],
  cancelled:       [],
}

export function isValidTransition(from: string, to: string): boolean {
  return (TASK_STATUS_TRANSITIONS[from] || []).includes(to)
}

/**
 * Returns true if the only reason this task is blocked is a shadow race condition:
 * a Railway (shadow) failure arrived before the primary (n8n) success, setting the
 * task to blocked before the authoritative result was received.
 *
 * Callers must also confirm isShadowCallback = false before using this.
 * See /api/agent/output for the authoritative usage.
 */
export function isShadowRaceBlock(taskStatus: string, primarySuccess: boolean): boolean {
  return taskStatus === 'blocked' && primarySuccess === true
}

// ─── n8n Webhook ──────────────────────────────────────────────────────────────

export interface DispatchPayload {
  task_id: string
  task_run_id: string
  project_id: string
  agent_role: string
  task_type: string
  task_name: string
  description: string | null
  context_payload: unknown
  callback_url: string
  idempotency_key: string
}

export async function emitToN8n(
  webhookUrl: string,
  payload: DispatchPayload,
  secret?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (secret) {
      headers['X-Buildos-Secret'] = secret
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    if (!res.ok) {
      return { ok: false, error: `n8n webhook returned ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Webhook emit failed' }
  }
}
