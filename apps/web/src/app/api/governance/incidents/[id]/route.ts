/**
 * GET /api/governance/incidents/[id]
 *
 * Returns a single incident with its root causes and fixes.
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authed = await resolveAuth(request)
    if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminSupabaseClient()
    const { id } = params

    // Fetch incident
    const { data: incident, error: incErr } = await admin
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single()

    if (incErr || !incident) {
      return NextResponse.json({ error: `Incident '${id}' not found` }, { status: 404 })
    }

    // Fetch root causes
    const { data: rootCauses } = await admin
      .from('incident_root_causes')
      .select('*')
      .eq('incident_id', id)
      .order('created_at', { ascending: true })

    // Fetch fixes
    const { data: fixes } = await admin
      .from('incident_fixes')
      .select('*')
      .eq('incident_id', id)
      .order('created_at', { ascending: true })

    // Fetch linked prevention rule if any
    let prevention_rule = null
    if (incident.related_rule_id) {
      const { data: rule } = await admin
        .from('prevention_rules')
        .select('id, rule_code, title, status')
        .eq('id', incident.related_rule_id)
        .single()
      prevention_rule = rule
    }

    return NextResponse.json({
      data: {
        ...incident,
        root_causes:     rootCauses ?? [],
        fixes:           fixes ?? [],
        prevention_rule,
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
