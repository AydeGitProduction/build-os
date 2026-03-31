/**
 * POST /api/governance/incidents/[id]/fix
 *
 * Block G2: Add a fix record to an incident.
 * fix_type, fix_description, implementation_notes all required.
 * For P0/P1 incidents: permanent_prevention_added must be true.
 *
 * Auth: X-Buildos-Secret OR authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

const VALID_FIX_TYPES = ['permanent', 'temporary', 'workaround', 'mitigation'] as const

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
      .select('id, incident_code, severity, status')
      .eq('id', id)
      .single()

    if (incErr || !incident) {
      return NextResponse.json({ error: `Incident '${id}' not found` }, { status: 404 })
    }

    if (incident.status === 'closed') {
      return NextResponse.json(
        { error: 'Cannot add fix to a closed incident' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      fix_type,
      fix_description,
      implementation_notes,
      permanent_prevention_added = false,
    } = body

    // ── Validate required fields ──────────────────────────────────────────────
    const missing: string[] = []
    if (!fix_type)              missing.push('fix_type')
    if (!fix_description)       missing.push('fix_description')
    if (!implementation_notes)  missing.push('implementation_notes')

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fix fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    if (!VALID_FIX_TYPES.includes(fix_type)) {
      return NextResponse.json(
        { error: `fix_type must be one of: ${VALID_FIX_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // ── Escalation rule: P0/P1 require permanent prevention ──────────────────
    if (['P0', 'P1'].includes(incident.severity) && !permanent_prevention_added) {
      return NextResponse.json(
        {
          error: `P0/P1 incidents require permanent_prevention_added: true in the fix record.`,
          enforcement: 'Block G2 escalation rule: high-severity incidents must produce a permanent prevention.',
          incident_severity: incident.severity,
        },
        { status: 422 }
      )
    }

    // ── Insert fix ────────────────────────────────────────────────────────────
    const { data, error: dbError } = await admin
      .from('incident_fixes')
      .insert({
        incident_id:                id,
        fix_type,
        fix_description,
        implementation_notes,
        permanent_prevention_added: Boolean(permanent_prevention_added),
      })
      .select()
      .single()

    if (dbError) {
      console.error('[incidents/fix POST] DB error:', dbError.message)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Advance incident status to fix_in_progress
    if (incident.status !== 'fix_in_progress') {
      await admin
        .from('incidents')
        .update({ status: 'fix_in_progress' })
        .eq('id', id)
    }

    console.info(`[incidents/fix POST] Fix added to ${incident.incident_code}`)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
