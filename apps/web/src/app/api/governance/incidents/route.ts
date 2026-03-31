/**
 * GET   /api/governance/incidents  — list incidents (newest first)
 * POST  /api/governance/incidents  — create incident (Block G2)
 *
 * Block G2: Formal incident management system.
 * Uses: incidents table (INC-XXXX codes), incident_root_causes, incident_fixes.
 *
 * Auth: X-Buildos-Secret (internal) OR authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

const VALID_SEVERITIES  = ['P0', 'P1', 'P2', 'P3'] as const
const VALID_TYPES       = ['logic', 'state', 'contract', 'ui', 'infra', 'data', 'security', 'performance', 'workflow'] as const
const VALID_OWNER_DOMAINS = ['backend', 'infra', 'frontend', 'qa', 'architect', 'security'] as const

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveAuth(request: NextRequest): Promise<{ ok: boolean; userId: string | null }> {
  const secret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [
    process.env.BUILDOS_INTERNAL_SECRET,
    process.env.BUILDOS_SECRET,
    process.env.N8N_WEBHOOK_SECRET,
  ].filter(Boolean)

  if (secret && validSecrets.includes(secret)) {
    return { ok: true, userId: null }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, userId: null }
  return { ok: true, userId: user.id }
}

// ─── GET: List incidents ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { ok } = await resolveAuth(request)
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminSupabaseClient()
    const { searchParams } = new URL(request.url)

    const status   = searchParams.get('status')
    const severity = searchParams.get('severity')
    const limit    = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const offset   = parseInt(searchParams.get('offset') ?? '0', 10)

    let query = admin
      .from('incidents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status)   query = query.eq('status', status)
    if (severity) query = query.eq('severity', severity)

    const { data, error, count } = await query

    if (error) {
      console.error('[governance/incidents GET] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count, limit, offset })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── POST: Create incident ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { ok } = await resolveAuth(request)
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminSupabaseClient()
    const body = await request.json()

    const {
      title,
      description,
      severity,
      incident_type,
      owner_domain,
      related_task_id  = null,
      related_rule_id  = null,
    } = body

    // ── Validate required fields ──────────────────────────────────────────────
    const missing: string[] = []
    if (!title)         missing.push('title')
    if (!severity)      missing.push('severity')
    if (!incident_type) missing.push('incident_type')
    if (!owner_domain)  missing.push('owner_domain')

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    if (!VALID_SEVERITIES.includes(severity)) {
      return NextResponse.json(
        { error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!VALID_TYPES.includes(incident_type)) {
      return NextResponse.json(
        { error: `incident_type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!VALID_OWNER_DOMAINS.includes(owner_domain)) {
      return NextResponse.json(
        { error: `owner_domain must be one of: ${VALID_OWNER_DOMAINS.join(', ')}` },
        { status: 400 }
      )
    }

    // ── Optional: verify related_rule_id exists ───────────────────────────────
    if (related_rule_id) {
      const { data: ruleCheck } = await admin
        .from('prevention_rules')
        .select('id')
        .eq('id', related_rule_id)
        .single()

      if (!ruleCheck) {
        return NextResponse.json(
          { error: `related_rule_id '${related_rule_id}' not found in prevention_rules` },
          { status: 404 }
        )
      }
    }

    // ── Insert ────────────────────────────────────────────────────────────────
    const { data, error: dbError } = await admin
      .from('incidents')
      .insert({
        title,
        description:     description ?? null,
        severity,
        incident_type,
        status:          'open',
        owner_domain,
        related_task_id: related_task_id ?? null,
        related_rule_id: related_rule_id ?? null,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[governance/incidents POST] DB error:', dbError.message)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    console.info(`[governance/incidents POST] Created ${data.incident_code}: ${title}`)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
