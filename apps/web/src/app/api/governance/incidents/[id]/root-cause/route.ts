/**
 * POST /api/governance/incidents/[id]/root-cause
 *
 * Block G2: Add a root cause analysis record to an incident.
 * All 5 RCA fields are required.
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

    // Verify incident exists
    const { data: incident, error: incErr } = await admin
      .from('incidents')
      .select('id, incident_code, status')
      .eq('id', id)
      .single()

    if (incErr || !incident) {
      return NextResponse.json({ error: `Incident '${id}' not found` }, { status: 404 })
    }

    if (incident.status === 'closed') {
      return NextResponse.json(
        { error: 'Cannot add root cause to a closed incident' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      symptom,
      trigger,
      broken_assumption,
      missing_guardrail,
      why_not_caught_earlier,
    } = body

    // All 5 fields required
    const missing: string[] = []
    if (!symptom)                 missing.push('symptom')
    if (!trigger)                 missing.push('trigger')
    if (!broken_assumption)       missing.push('broken_assumption')
    if (!missing_guardrail)       missing.push('missing_guardrail')
    if (!why_not_caught_earlier)  missing.push('why_not_caught_earlier')

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required RCA fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // Insert root cause
    const { data, error: dbError } = await admin
      .from('incident_root_causes')
      .insert({
        incident_id:            id,
        symptom,
        trigger,
        broken_assumption,
        missing_guardrail,
        why_not_caught_earlier,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[incidents/root-cause POST] DB error:', dbError.message)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Advance incident status to investigating if still open
    if (incident.status === 'open') {
      await admin
        .from('incidents')
        .update({ status: 'investigating' })
        .eq('id', id)
    }

    console.info(`[incidents/root-cause POST] RCA added to ${incident.incident_code}`)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
