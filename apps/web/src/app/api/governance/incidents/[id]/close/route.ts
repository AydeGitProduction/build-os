/**
 * POST /api/governance/incidents/[id]/close
 *
 * Block G2: Close an incident.
 *
 * ENFORCEMENT — ALL SIX REQUIREMENTS MUST BE MET:
 * A) severity is set
 * B) incident_type is set
 * C) owner_domain is set
 * D) at least one incident_root_causes row exists
 * E) at least one incident_fixes row exists
 * F) related_rule_id is set (FK to prevention_rules)
 *
 * Returns 422 with list of missing requirements if any are absent.
 *
 * Auth: X-Buildos-Secret OR authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

async function resolveAuth(request: NextRequest): Promise<boolean> {
  const secret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [
    process.env.BUILDOS_INTERNAL_SECRET,
    process.env.BUILDOS_SECRET,
    process.env.N8N_WEBHOOK_SECRET,
  ].filter(Boolean)
  if (secret && validSecrets.includes(secret)) return true

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return !error && !!user
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authed = await resolveAuth(request)
    if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminSupabaseClient()
    const { id } = params

    // Optional body: related_rule_id can be supplied at close time
    let bodyRuleId: string | null = null
    try {
      const body = await request.json()
      bodyRuleId = body.related_rule_id ?? null
    } catch {
      // empty body is fine
    }

    // ── Fetch incident ────────────────────────────────────────────────────────
    const { data: incident, error: incErr } = await admin
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single()

    if (incErr || !incident) {
      return NextResponse.json({ error: `Incident '${id}' not found` }, { status: 404 })
    }

    if (incident.status === 'closed') {
      return NextResponse.json(
        { error: 'Incident is already closed', incident_code: incident.incident_code },
        { status: 400 }
      )
    }

    // ── Run all closure checks ────────────────────────────────────────────────
    const missing: string[] = []

    // A — severity
    if (!incident.severity) missing.push('A: severity not set')

    // B — incident_type
    if (!incident.incident_type) missing.push('B: incident_type not set')

    // C — owner_domain
    if (!incident.owner_domain) missing.push('C: owner_domain not set')

    // D — root cause record
    const { count: rcCount, error: rcErr } = await admin
      .from('incident_root_causes')
      .select('id', { count: 'exact', head: true })
      .eq('incident_id', id)

    if (rcErr || !rcCount || rcCount === 0) {
      missing.push('D: no root_cause record (POST /root-cause first)')
    }

    // E — fix record
    const { count: fixCount, error: fixErr } = await admin
      .from('incident_fixes')
      .select('id', { count: 'exact', head: true })
      .eq('incident_id', id)

    if (fixErr || !fixCount || fixCount === 0) {
      missing.push('E: no fix record (POST /fix first)')
    }

    // F — prevention rule linked
    const resolvedRuleId = bodyRuleId || incident.related_rule_id

    if (!resolvedRuleId) {
      missing.push('F: no related_rule_id (link or create a prevention_rule first)')
    } else {
      // Verify rule exists
      const { data: ruleCheck } = await admin
        .from('prevention_rules')
        .select('id, rule_code, title')
        .eq('id', resolvedRuleId)
        .single()

      if (!ruleCheck) {
        missing.push(`F: related_rule_id '${resolvedRuleId}' not found in prevention_rules`)
      }
    }

    // ── Enforce: reject if any requirement missing ────────────────────────────
    if (missing.length > 0) {
      console.warn(
        `[incidents/close] ${incident.incident_code} close REJECTED — missing: ${missing.join('; ')}`
      )
      return NextResponse.json(
        {
          error:       'Incident cannot be closed: missing requirements',
          missing,
          enforcement: 'Block G2 — all 6 closure requirements must be satisfied',
          incident_code: incident.incident_code,
          current_status: incident.status,
          requirements: {
            A_severity:          !!incident.severity,
            B_incident_type:     !!incident.incident_type,
            C_owner_domain:      !!incident.owner_domain,
            D_root_cause_record: !rcErr && !!rcCount && rcCount > 0,
            E_fix_record:        !fixErr && !!fixCount && fixCount > 0,
            F_prevention_rule:   !!resolvedRuleId,
          },
        },
        { status: 422 }
      )
    }

    // ── All requirements met — close the incident ─────────────────────────────
    const now = new Date().toISOString()

    const { data: closed, error: closeErr } = await admin
      .from('incidents')
      .update({
        status:          'closed',
        closed_at:       now,
        related_rule_id: resolvedRuleId,
      })
      .eq('id', id)
      .select()
      .single()

    if (closeErr) {
      console.error('[incidents/close POST] DB error:', closeErr.message)
      return NextResponse.json({ error: closeErr.message }, { status: 500 })
    }

    console.info(
      `[incidents/close POST] ${incident.incident_code} CLOSED — rule: ${resolvedRuleId}`
    )

    return NextResponse.json({
      data:    closed,
      message: `${incident.incident_code} closed successfully`,
      closed_at: now,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
