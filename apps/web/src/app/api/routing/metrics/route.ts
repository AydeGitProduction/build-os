/**
 * GET /api/routing/metrics
 *
 * Returns routing observability metrics for a project.
 * Aggregates routing_decisions: model distribution, fallback rate, rule usage.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')

  let query = admin
    .from('routing_decisions')
    .select('model, runtime, rule_name, fallback_used, complexity_tier, risk_tier, cost_ceiling_usd, decision_ms')

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error: dbError } = await query.limit(1000)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  const rows = data || []
  const total = rows.length

  // Model distribution
  const modelCounts: Record<string, number> = {}
  const runtimeCounts: Record<string, number> = {}
  const ruleCounts: Record<string, number> = {}
  const complexityCounts: Record<string, number> = {}
  let fallbackCount = 0
  let totalDecisionMs = 0

  for (const r of rows) {
    modelCounts[r.model]       = (modelCounts[r.model]       || 0) + 1
    runtimeCounts[r.runtime]   = (runtimeCounts[r.runtime]   || 0) + 1
    ruleCounts[r.rule_name]    = (ruleCounts[r.rule_name]    || 0) + 1
    complexityCounts[r.complexity_tier] = (complexityCounts[r.complexity_tier] || 0) + 1
    if (r.fallback_used) fallbackCount++
    totalDecisionMs += r.decision_ms || 0
  }

  return NextResponse.json({
    data: {
      total_decisions:      total,
      fallback_rate:        total > 0 ? (fallbackCount / total) : 0,
      avg_decision_ms:      total > 0 ? Math.round(totalDecisionMs / total) : 0,
      model_distribution:   modelCounts,
      runtime_distribution: runtimeCounts,
      rule_usage:           ruleCounts,
      complexity_distribution: complexityCounts,
      legacy_routing_count: 0, // ERT-P6C hard switch — no legacy routing
    }
  })
}
