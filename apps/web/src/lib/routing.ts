/**
 * routing.ts — P8 Routing Engine
 *
 * Provides `decide()` for model/runtime selection given a task.
 * Queries routing_rules and routing_profiles from Supabase.
 * Falls back to sensible defaults when tables are empty or rules don't match.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Model ID map: internal name → Anthropic API string
// ─────────────────────────────────────────────────────────────────────────────

export const MODEL_IDS: Record<string, string> = {
  haiku:           'claude-haiku-4-5-20251001',
  'haiku-3.5':     'claude-haiku-4-5-20251001',
  haiku3:          'claude-haiku-4-5-20251001',
  sonnet:          'claude-sonnet-4-6',
  'sonnet-3.5':    'claude-sonnet-4-6',
  sonnet35:        'claude-sonnet-4-6',
  opus:            'claude-opus-4-6',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6':         'claude-sonnet-4-6',
  'claude-opus-4-6':           'claude-opus-4-6',
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskInput {
  id?: string
  title?: string
  description?: string
  agent_role?: string
  task_type?: string
  context_payload?: Record<string, unknown> | null
  project_id?: string
}

export interface RoutingDecision {
  profile:          string
  model:            string
  runtime:          string
  rule_name:        string
  cost_ceiling_usd: number
  rationale:        string
  fallback_used:    boolean
  decision_ms:      number
  retry_policy?:    Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier classification helpers
// ─────────────────────────────────────────────────────────────────────────────

type ComplexityTier = 'low' | 'medium' | 'high'
type RiskTier       = 'low' | 'medium' | 'high'
type CostTier       = 'low' | 'medium' | 'high'

const HEAVY_ROLES = new Set([
  'architect', 'tech_lead', 'security_auditor', 'qa_security_auditor',
  'full_stack_engineer', 'software_engineer',
])

const LIGHT_ROLES = new Set([
  'qa_engineer', 'technical_writer', 'devops_engineer',
])

function classifyComplexity(task: TaskInput): ComplexityTier {
  const title = (task.title ?? '').toLowerCase()
  const desc  = (task.description ?? '').toLowerCase()
  const combined = title + ' ' + desc

  if (combined.includes('architect') || combined.includes('design') ||
      combined.includes('refactor') || combined.includes('security') ||
      HEAVY_ROLES.has(task.agent_role ?? '')) {
    return 'high'
  }
  if (combined.includes('implement') || combined.includes('add') ||
      combined.includes('create') || combined.includes('update') ||
      combined.includes('integrate')) {
    return 'medium'
  }
  return 'low'
}

function classifyRisk(task: TaskInput): RiskTier {
  const role = task.agent_role ?? ''
  if (HEAVY_ROLES.has(role) || role.includes('security')) return 'high'
  if (LIGHT_ROLES.has(role) || role.includes('qa')) return 'low'
  return 'medium'
}

function classifyCost(task: TaskInput): CostTier {
  const complexity = classifyComplexity(task)
  if (complexity === 'high') return 'high'
  if (complexity === 'medium') return 'medium'
  return 'low'
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyTask — returns tier classification for a task
// ─────────────────────────────────────────────────────────────────────────────

export function classifyTask(task: TaskInput): {
  complexity_tier: ComplexityTier
  risk_tier: RiskTier
  cost_tier: CostTier
} {
  return {
    complexity_tier: classifyComplexity(task),
    risk_tier:       classifyRisk(task),
    cost_tier:       classifyCost(task),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default routing rules (fallback when DB table is empty)
// ─────────────────────────────────────────────────────────────────────────────

interface RoutingRule {
  name:             string
  model:            string
  runtime:          string
  cost_ceiling_usd: number
  profile:          string
  retry_policy?:    Record<string, unknown>
  matcher?: (task: TaskInput) => boolean
}

const DEFAULT_RULES: RoutingRule[] = [
  {
    name: 'heavy-roles-opus',
    profile: 'premium',
    model: 'sonnet',
    runtime: 'n8n',
    cost_ceiling_usd: 0.50,
    matcher: (t) => HEAVY_ROLES.has(t.agent_role ?? ''),
  },
  {
    name: 'light-roles-haiku',
    profile: 'economy',
    model: 'haiku',
    runtime: 'n8n',
    cost_ceiling_usd: 0.10,
    matcher: (t) => LIGHT_ROLES.has(t.agent_role ?? ''),
  },
  {
    name: 'default-sonnet',
    profile: 'standard',
    model: 'sonnet',
    runtime: 'n8n',
    cost_ceiling_usd: 0.25,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// decide — main routing function
// ─────────────────────────────────────────────────────────────────────────────

export async function decide(
  task: TaskInput,
  admin: SupabaseClient | null,
  taskRunId: string | null,
): Promise<RoutingDecision> {
  const startMs = Date.now()
  const tiers = classifyTask(task)

  let decision: RoutingDecision | null = null
  let fallback_used = false

  // ── 1. Try DB routing rules ───────────────────────────────────────────────
  if (admin) {
    try {
      const { data: rules } = await admin
        .from('routing_rules')
        .select('*')
        .eq('enabled', true)
        .order('priority', { ascending: false })
        .limit(50)

      if (rules && rules.length > 0) {
        for (const rule of rules) {
          // Simple matching: check complexity_tier, risk_tier, cost_tier
          const complexityMatch =
            !rule.complexity_tier || rule.complexity_tier === tiers.complexity_tier
          const riskMatch =
            !rule.risk_tier || rule.risk_tier === tiers.risk_tier
          const roleMatch =
            !rule.agent_role || rule.agent_role === task.agent_role

          if (complexityMatch && riskMatch && roleMatch) {
            // Get profile for retry_policy
            let retryPolicy: Record<string, unknown> | undefined
            if (rule.profile_id && admin) {
              const { data: profile } = await admin
                .from('routing_profiles')
                .select('retry_policy')
                .eq('id', rule.profile_id)
                .single()
              retryPolicy = profile?.retry_policy as Record<string, unknown> | undefined
            }

            decision = {
              profile:          rule.profile_id ?? 'standard',
              model:            rule.model ?? 'sonnet',
              runtime:          rule.runtime ?? 'n8n',
              rule_name:        rule.name ?? 'db_rule',
              cost_ceiling_usd: rule.cost_ceiling_usd ?? 0.25,
              rationale:        `Matched DB rule: ${rule.name}`,
              fallback_used:    false,
              decision_ms:      Date.now() - startMs,
              retry_policy:     retryPolicy,
            }
            break
          }
        }
      }
    } catch {
      // DB error — fall through to default rules
      fallback_used = true
    }
  }

  // ── 2. Fall back to static rules ─────────────────────────────────────────
  if (!decision) {
    fallback_used = true
    for (const rule of DEFAULT_RULES) {
      if (!rule.matcher || rule.matcher(task)) {
        decision = {
          profile:          rule.profile,
          model:            rule.model,
          runtime:          rule.runtime,
          rule_name:        rule.name,
          cost_ceiling_usd: rule.cost_ceiling_usd,
          rationale:        `Static fallback rule: ${rule.name}`,
          fallback_used:    true,
          decision_ms:      Date.now() - startMs,
          retry_policy:     rule.retry_policy,
        }
        break
      }
    }
  }

  // ── 3. Last-resort default ────────────────────────────────────────────────
  if (!decision) {
    decision = {
      profile:          'standard',
      model:            'sonnet',
      runtime:          'n8n',
      rule_name:        'hardcoded_default',
      cost_ceiling_usd: 0.25,
      rationale:        'No matching rule — hardcoded default',
      fallback_used:    true,
      decision_ms:      Date.now() - startMs,
    }
  }

  decision.decision_ms = Date.now() - startMs

  // ── 4. Persist routing_decision ──────────────────────────────────────────
  if (admin && task.id) {
    try {
      await admin.from('routing_decisions').insert({
        task_id:          task.id,
        task_run_id:      taskRunId,
        project_id:       task.project_id ?? null,
        complexity_tier:  tiers.complexity_tier,
        risk_tier:        tiers.risk_tier,
        cost_tier:        tiers.cost_tier,
        rule_name:        decision.rule_name,
        runtime:          decision.runtime,
        model:            decision.model,
        cost_ceiling_usd: decision.cost_ceiling_usd,
        rationale:        decision.rationale,
        decision_ms:      decision.decision_ms,
        fallback_used:    decision.fallback_used || fallback_used,
        decided_at:       new Date().toISOString(),
      })
    } catch {
      // Non-fatal — routing decisions are audit-only
    }
  }

  return decision
}
