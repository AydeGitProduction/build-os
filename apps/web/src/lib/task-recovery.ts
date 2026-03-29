/**
 * Build OS — Task Splitting & Timeout Recovery System
 *
 * Implements intelligent recovery for tasks that repeatedly timeout or fail.
 * Instead of blind retries, the system evaluates each failing task and applies
 * the correct recovery strategy:
 *
 *   retry_same        — retry as-is (narrow scope, first timeout)
 *   reroute_worker    — same task, different execution path / worker priority
 *   reduce_scope      — rephrase task to be narrower / less broad
 *   split_task        — break into independent child tasks
 *   escalate_manual   — mark for human review, pause auto-execution
 *
 * Parent-child linkage is stored in context_payload:
 *   { _split: { parent_task_id, split_reason, recovery_strategy, child_index, total_children } }
 *
 * Split parent state is stored in context_payload:
 *   { _split_state: 'split_into_children', child_ids: [...], split_at: timestamp }
 *
 * Escalated task state:
 *   { _escalation: { reason, escalated_at, strategy: 'escalate_manual' } }
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Recovery strategy types ───────────────────────────────────────────────────

export type RecoveryStrategy =
  | 'retry_same'
  | 'reroute_worker'
  | 'reduce_scope'
  | 'split_task'
  | 'escalate_manual'

export interface RecoveryDecision {
  task_id:          string
  strategy:         RecoveryStrategy
  reason:           string
  split_plan?:      SplitPlan
  reroute_priority?: 'critical' | 'high' | 'medium' | 'low'
  reduced_title?:   string
  reduced_description?: string
}

export interface SplitPlan {
  parent_reason: string
  children: Array<{
    title:        string
    description:  string
    agent_role:   string
    task_type:    string
    priority:     string
    order_index:  number
  }>
}

export interface TaskForRecovery {
  id:               string
  title:            string
  description:      string | null
  agent_role:       string
  task_type:        string
  priority:         string
  retry_count:      number
  max_retries:      number
  feature_id:       string
  project_id:       string
  context_payload:  Record<string, any> | null
  updated_at:       string
  dispatched_at:    string | null
}

// ── Decision formula ─────────────────────────────────────────────────────────

/**
 * Core decision tree: given a task's failure profile, determine the best
 * recovery strategy.
 */
export function evaluateRecoveryStrategy(task: TaskForRecovery): RecoveryDecision {
  const retryCount   = task.retry_count ?? 0
  const maxRetries   = task.max_retries ?? 3
  const title        = task.title ?? ''
  const desc         = task.description ?? ''

  // Extract timeout count from context_payload (set by watchdog/execution)
  const timeoutCount = task.context_payload?._timeout_count ?? 0

  // Check if this is a child task (don't split children)
  const isChildTask  = !!task.context_payload?._split?.parent_task_id

  // ── Case E: Escalate — truly unsolvable by AI ─────────────────────────────
  // Max retries exhausted with timeout pattern
  if (retryCount >= maxRetries && timeoutCount >= 2) {
    return {
      task_id:  task.id,
      strategy: 'escalate_manual',
      reason:   `Task exhausted ${maxRetries} retries with ${timeoutCount} timeouts — requires human review or external tooling`,
    }
  }

  // ── Case D: Split — clearly too broad ────────────────────────────────────
  // Don't split child tasks (prevents infinite recursion)
  if (!isChildTask && (timeoutCount >= 2 || retryCount >= 2)) {
    const splitSignals = detectSplitSignals(title, desc)
    if (splitSignals.should_split) {
      return {
        task_id:   task.id,
        strategy:  'split_task',
        reason:    splitSignals.reason,
        split_plan: generateSplitPlan(task, splitSignals),
      }
    }
  }

  // ── Case B: Reroute — execution path mismatch ────────────────────────────
  if (retryCount >= 1 && timeoutCount <= 1) {
    const reroutable = detectRerouteSignals(title, desc, task.agent_role)
    if (reroutable.should_reroute) {
      return {
        task_id:           task.id,
        strategy:          'reroute_worker',
        reason:            reroutable.reason,
        reroute_priority:  'high',
      }
    }
  }

  // ── Case C: Reduce scope — too broad but not multi-part ──────────────────
  if (retryCount >= 1 && detectScopeIssue(title, desc)) {
    const reduced = generateReducedScope(task)
    return {
      task_id:              task.id,
      strategy:             'reduce_scope',
      reason:               'Task scope appears too broad for a single execution window',
      reduced_title:        reduced.title,
      reduced_description:  reduced.description,
    }
  }

  // ── Case A: Retry as-is ──────────────────────────────────────────────────
  // First timeout, narrow scope → retry
  return {
    task_id:  task.id,
    strategy: 'retry_same',
    reason:   'First failure — retrying as-is with same parameters',
  }
}

// ── Signal detectors ─────────────────────────────────────────────────────────

interface SplitSignal {
  should_split: boolean
  reason:       string
  split_type:   'by_module' | 'by_feature' | 'by_output_type' | 'by_environment' | 'generic'
}

function detectSplitSignals(title: string, desc: string): SplitSignal {
  const combined = `${title} ${desc}`.toLowerCase()

  // By output type: "implement + tests + docs" in same task
  if ((combined.includes('implement') || combined.includes('create')) &&
      combined.includes('test') && combined.includes('doc')) {
    return { should_split: true, reason: 'Task covers implementation + tests + docs — split by output type', split_type: 'by_output_type' }
  }

  // By module: references multiple routes, pages, or modules
  const moduleSignals = ['all routes', 'all pages', 'all endpoints', 'full audit', 'all components', 'entire', 'all tables', 'across all']
  if (moduleSignals.some(s => combined.includes(s))) {
    return { should_split: true, reason: 'Task references multiple modules/routes — split by module', split_type: 'by_module' }
  }

  // By feature: "full", "complete", "entire flow"
  if (combined.includes('full flow') || combined.includes('entire flow') || combined.includes('end-to-end flow')) {
    return { should_split: true, reason: 'Task spans full flow — split by feature/step', split_type: 'by_feature' }
  }

  // By environment: references multiple environments
  if ((combined.includes('dev') && combined.includes('staging')) ||
      (combined.includes('staging') && combined.includes('prod'))) {
    return { should_split: true, reason: 'Task covers multiple environments — split by environment', split_type: 'by_environment' }
  }

  // Generic: very long description (>800 chars) likely too broad
  if (desc.length > 800 && (title.includes('and') || title.includes('&') || title.includes('+'))) {
    return { should_split: true, reason: 'Task title references multiple concerns with broad description', split_type: 'generic' }
  }

  return { should_split: false, reason: '', split_type: 'generic' }
}

function detectRerouteSignals(title: string, desc: string, agentRole: string): { should_reroute: boolean; reason: string } {
  const combined = `${title} ${desc}`.toLowerCase()

  // QA task dispatched to non-QA agent
  if ((combined.includes('test') || combined.includes('validate') || combined.includes('verify') || combined.includes('audit'))
      && agentRole !== 'qa_security_auditor') {
    return { should_reroute: true, reason: 'QA/validation task dispatched to non-QA agent — reroute to qa_security_auditor' }
  }

  // Integration task dispatched to non-integration agent
  if ((combined.includes('webhook') || combined.includes('n8n') || combined.includes('integration')) &&
      agentRole !== 'integration_engineer') {
    return { should_reroute: true, reason: 'Integration task on wrong agent — reroute to integration_engineer' }
  }

  // Architecture task on non-architect
  if ((combined.includes('architect') || combined.includes('design system') || combined.includes('schema design'))
      && agentRole !== 'architect') {
    return { should_reroute: true, reason: 'Architecture task should go to architect agent' }
  }

  return { should_reroute: false, reason: '' }
}

function detectScopeIssue(title: string, desc: string): boolean {
  const combined = `${title} ${desc}`.toLowerCase()
  // Broad scope signals
  return combined.includes('generate 20') ||
    combined.includes('generate all') ||
    combined.includes('full implementation') ||
    (combined.includes('complete') && desc.length > 600)
}

// ── Split plan generator ─────────────────────────────────────────────────────

function generateSplitPlan(task: TaskForRecovery, signal: SplitSignal): SplitPlan {
  const children: SplitPlan['children'] = []

  switch (signal.split_type) {
    case 'by_output_type':
      children.push(
        {
          title:       `[SPLIT] ${task.title} — Implementation only`,
          description: `Focused scope from parent task: ${task.title}\n\nDo the implementation only. Skip tests and documentation for now.\n\nOriginal description:\n${(task.description || '').substring(0, 1000)}`,
          agent_role:  task.agent_role,
          task_type:   task.task_type,
          priority:    task.priority,
          order_index: 0,
        },
        {
          title:       `[SPLIT] ${task.title} — Tests only`,
          description: `Write tests for the implementation of: ${task.title}\n\nFocus on unit tests and integration tests only. Assume implementation exists.`,
          agent_role:  task.agent_role === 'frontend_engineer' ? 'qa_security_auditor' : task.agent_role,
          task_type:   'test',
          priority:    task.priority,
          order_index: 1,
        },
        {
          title:       `[SPLIT] ${task.title} — Documentation only`,
          description: `Write documentation for: ${task.title}\n\nCreate inline comments, API docs, or README section as appropriate.`,
          agent_role:  'documentation_engineer',
          task_type:   'document',
          priority:    'low',
          order_index: 2,
        }
      )
      break

    case 'by_module': {
      // Extract module hints from description
      const desc = task.description || ''
      const lines = desc.split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d\./))
      const modules = lines.slice(0, 4).map((l, i) => l.replace(/^[-\d.]\s*/, '').trim()).filter(Boolean)

      if (modules.length >= 2) {
        modules.forEach((mod, i) => {
          children.push({
            title:       `[SPLIT] ${task.title} — ${mod.substring(0, 50)}`,
            description: `Focused scope: ${mod}\n\nPart of split from parent: ${task.title}\n\nHandle only this module/area: ${mod}`,
            agent_role:  task.agent_role,
            task_type:   task.task_type,
            priority:    task.priority,
            order_index: i,
          })
        })
      } else {
        // Fallback: split into first/second half
        const half = Math.floor(desc.length / 2)
        children.push(
          {
            title:       `[SPLIT] ${task.title} — Part 1`,
            description: `First part of split task.\n\nOriginal description (first half):\n${desc.substring(0, half)}`,
            agent_role:  task.agent_role,
            task_type:   task.task_type,
            priority:    task.priority,
            order_index: 0,
          },
          {
            title:       `[SPLIT] ${task.title} — Part 2`,
            description: `Second part of split task.\n\nOriginal description (second half):\n${desc.substring(half)}`,
            agent_role:  task.agent_role,
            task_type:   task.task_type,
            priority:    task.priority,
            order_index: 1,
          }
        )
      }
      break
    }

    default:
      // Generic split: 2 parts
      children.push(
        {
          title:       `[SPLIT] ${task.title} — Core implementation`,
          description: `Core implementation scope from parent task: ${task.title}\n\n${(task.description || '').substring(0, 800)}`,
          agent_role:  task.agent_role,
          task_type:   task.task_type,
          priority:    task.priority,
          order_index: 0,
        },
        {
          title:       `[SPLIT] ${task.title} — Edge cases & validation`,
          description: `Edge cases, error handling, and validation for: ${task.title}\n\nFocus on robustness, error paths, and integration points.`,
          agent_role:  task.agent_role === 'backend_engineer' ? 'qa_security_auditor' : task.agent_role,
          task_type:   'review',
          priority:    'medium',
          order_index: 1,
        }
      )
  }

  return { parent_reason: signal.reason, children }
}

function generateReducedScope(task: TaskForRecovery): { title: string; description: string } {
  const title = task.title
    .replace(/generate \d+/gi, 'generate 3 highest-priority')
    .replace(/full audit/gi, 'critical-path audit')
    .replace(/complete implementation/gi, 'core implementation')
    .replace(/all \w+/gi, match => `key ${match.split(' ')[1]}`)

  const desc = `Reduced scope version of: "${task.title}"\n\nFocus only on the highest-impact, critical-path elements. Skip lower-priority edge cases.\n\nOriginal description:\n${(task.description || '').substring(0, 600)}`

  return { title, description: desc }
}

// ── Apply recovery ────────────────────────────────────────────────────────────

export interface RecoveryResult {
  task_id:          string
  strategy_applied: RecoveryStrategy
  success:          boolean
  child_ids?:       string[]
  error?:           string
}

export async function applyRecovery(
  admin: SupabaseClient,
  task: TaskForRecovery,
  decision: RecoveryDecision
): Promise<RecoveryResult> {
  try {
    switch (decision.strategy) {

      case 'retry_same': {
        // Increment timeout_count, reset to ready
        const newPayload = {
          ...(task.context_payload || {}),
          _timeout_count: (task.context_payload?._timeout_count ?? 0) + 1,
          _last_recovery: { strategy: 'retry_same', reason: decision.reason, at: new Date().toISOString() },
        }
        await admin.from('tasks')
          .update({ status: 'ready', context_payload: newPayload })
          .eq('id', task.id)
        return { task_id: task.id, strategy_applied: 'retry_same', success: true }
      }

      case 'reroute_worker': {
        // Change priority and reset to ready
        const newPayload = {
          ...(task.context_payload || {}),
          _timeout_count: (task.context_payload?._timeout_count ?? 0) + 1,
          _last_recovery: { strategy: 'reroute_worker', reason: decision.reason, at: new Date().toISOString() },
        }
        await admin.from('tasks')
          .update({
            status:   'ready',
            priority: decision.reroute_priority || 'high',
            context_payload: newPayload,
          })
          .eq('id', task.id)
        return { task_id: task.id, strategy_applied: 'reroute_worker', success: true }
      }

      case 'reduce_scope': {
        const newPayload = {
          ...(task.context_payload || {}),
          _last_recovery: { strategy: 'reduce_scope', reason: decision.reason, at: new Date().toISOString() },
          _original_title: task.title,
        }
        await admin.from('tasks')
          .update({
            status:      'ready',
            title:       decision.reduced_title || task.title,
            description: decision.reduced_description || task.description,
            context_payload: newPayload,
          })
          .eq('id', task.id)
        return { task_id: task.id, strategy_applied: 'reduce_scope', success: true }
      }

      case 'split_task': {
        if (!decision.split_plan || decision.split_plan.children.length === 0) {
          // Fallback to retry if no split plan
          await admin.from('tasks').update({ status: 'ready' }).eq('id', task.id)
          return { task_id: task.id, strategy_applied: 'split_task', success: false, error: 'No split plan generated' }
        }

        // Mark parent as superseded
        const parentPayload = {
          ...(task.context_payload || {}),
          _split_state: 'split_into_children',
          _split_reason: decision.split_plan.parent_reason,
          _split_at: new Date().toISOString(),
          _child_count: decision.split_plan.children.length,
        }
        await admin.from('tasks')
          .update({ status: 'blocked', context_payload: parentPayload })
          .eq('id', task.id)

        // Create child tasks
        const childIds: string[] = []
        for (const child of decision.split_plan.children) {
          const childPayload = {
            _split: {
              parent_task_id: task.id,
              split_reason:   decision.split_plan.parent_reason,
              recovery_strategy: 'split_task',
              child_index:    child.order_index,
              total_children: decision.split_plan.children.length,
            },
          }

          const { data: created } = await admin.from('tasks').insert({
            feature_id:      task.feature_id,
            project_id:      task.project_id,
            title:           child.title,
            description:     child.description,
            agent_role:      child.agent_role,
            status:          'ready',
            task_type:       child.task_type,
            priority:        child.priority,
            order_index:     child.order_index + 1000, // append to end
            max_retries:     3,
            context_payload: childPayload,
          }).select('id').single()

          if (created?.id) {
            childIds.push(created.id)
          }
        }

        // Update parent with actual child IDs
        const updatedParentPayload = { ...parentPayload, _child_ids: childIds }
        await admin.from('tasks')
          .update({ context_payload: updatedParentPayload })
          .eq('id', task.id)

        return { task_id: task.id, strategy_applied: 'split_task', success: true, child_ids: childIds }
      }

      case 'escalate_manual': {
        const escalationPayload = {
          ...(task.context_payload || {}),
          _escalation: {
            reason: decision.reason,
            escalated_at: new Date().toISOString(),
            strategy: 'escalate_manual',
            retry_count_at_escalation: task.retry_count,
            timeout_count_at_escalation: task.context_payload?._timeout_count ?? 0,
          },
        }
        await admin.from('tasks')
          .update({ status: 'blocked', context_payload: escalationPayload })
          .eq('id', task.id)
        return { task_id: task.id, strategy_applied: 'escalate_manual', success: true }
      }

      default:
        return { task_id: task.id, strategy_applied: 'retry_same', success: false, error: 'Unknown strategy' }
    }
  } catch (err: any) {
    return { task_id: task.id, strategy_applied: decision.strategy, success: false, error: err.message }
  }
}

// ── Batch recovery scan ────────────────────────────────────────────────────────

export interface RecoveryScanResult {
  scanned:   number
  recovered: RecoveryResult[]
  skipped:   number
  errors:    string[]
}

/**
 * Scan all failed tasks in a project and apply recovery decisions.
 * Called by the watchdog on every run.
 */
export async function runRecoveryScan(
  admin: SupabaseClient,
  projectId: string,
  options: { dryRun?: boolean } = {}
): Promise<RecoveryScanResult> {
  const result: RecoveryScanResult = { scanned: 0, recovered: [], skipped: 0, errors: [] }

  // Find tasks that need recovery: failed with retry_count > 0, or blocked with split state
  const { data: candidates, error } = await admin
    .from('tasks')
    .select('id, title, description, agent_role, task_type, priority, retry_count, max_retries, feature_id, project_id, context_payload, updated_at, dispatched_at')
    .eq('project_id', projectId)
    .eq('status', 'failed')
    .gte('retry_count', 1)   // at least tried once
    .order('updated_at', { ascending: true })
    .limit(20)

  if (error) {
    result.errors.push(`scan query failed: ${error.message}`)
    return result
  }

  if (!candidates || candidates.length === 0) return result
  result.scanned = candidates.length

  for (const task of candidates as TaskForRecovery[]) {
    // Skip tasks already escalated or already split
    if (task.context_payload?._escalation || task.context_payload?._split_state === 'split_into_children') {
      result.skipped++
      continue
    }

    const decision = evaluateRecoveryStrategy(task)

    if (options.dryRun) {
      result.recovered.push({
        task_id:          task.id,
        strategy_applied: decision.strategy,
        success:          true,  // simulated
      })
      continue
    }

    const recovery = await applyRecovery(admin, task, decision)
    result.recovered.push(recovery)

    if (!recovery.success && recovery.error) {
      result.errors.push(`task ${task.id}: ${recovery.error}`)
    }
  }

  return result
}
