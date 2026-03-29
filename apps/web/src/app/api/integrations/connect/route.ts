/**
 * POST /api/integrations/connect
 * Connect an integration provider to a project.
 *
 * Security model (Phase 2.5):
 *   - Credential values are encrypted with AES-256-GCM envelope encryption
 *   - encrypted_values stored as bytea in credentials table
 *   - credentials_safe_view NEVER exposes encrypted_values
 *   - Only admin client (service_role) writes to credentials table
 *   - User input is never stored in plaintext
 *
 * GET /api/integrations/connect?project_id= — list project integrations (safe view)
 * DELETE /api/integrations/connect?integration_id= — deactivate integration (soft-delete)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/execution'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// ── Envelope encryption helpers ───────────────────────────────────────────────

const ENCRYPTION_ALGO = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits

/**
 * Encrypt credential values using AES-256-GCM.
 * Uses a per-credential DEK derived from the MEK (master key).
 * Returns { encryptedHex, keyRef } where keyRef identifies the key version.
 */
function encryptCredentialValues(
  values: Record<string, string>
): { encryptedHex: string; keyRef: string } {
  const mek = process.env.CREDENTIAL_ENCRYPTION_KEY
  if (!mek || mek.length < 32) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured or too short (must be 32+ chars)')
  }

  // Derive a per-credential DEK by XORing MEK with a random salt
  const salt = randomBytes(16)
  const mekBuffer = Buffer.from(mek.slice(0, KEY_LENGTH), 'utf8')
  const dek = Buffer.alloc(KEY_LENGTH)
  for (let i = 0; i < KEY_LENGTH; i++) {
    dek[i] = mekBuffer[i] ^ salt[i % 16]
  }

  const iv  = randomBytes(12) // 96-bit IV for GCM
  const cipher = createCipheriv(ENCRYPTION_ALGO, dek, iv)

  const plaintext = JSON.stringify(values)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()

  // Format: salt(16) + iv(12) + authTag(16) + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted])
  const encryptedHex = combined.toString('hex')

  return {
    encryptedHex,
    keyRef: `mek-v1-${salt.toString('hex').slice(0, 8)}`, // Key reference for rotation tracking
  }
}

// GET — list integrations for a project
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    }

    // Use credentials_safe_view — never returns encrypted_values
    const { data, error } = await supabase
      .from('project_integrations')
      .select(`
        id, project_id, provider_id, status, environment, created_at, updated_at,
        provider:integration_providers(id, name, slug, category, auth_type, description)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // For each integration, check if there's a safe credential record
    const admin = createAdminSupabaseClient()
    const { data: safeCredentials } = await admin
      .from('credentials_safe_view')
      .select('id, provider_id, label, is_active, expires_at, created_at')
      .eq('workspace_id', (await supabase.from('projects').select('workspace:workspaces(id)').eq('id', projectId).single()).data?.workspace?.id || '')

    return NextResponse.json({
      data: data || [],
      credentials: safeCredentials || [],
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// POST — connect an integration
export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      project_id,
      provider_id,
      environment = 'development',
      label,
      credential_values, // { field_name: value } — plaintext, encrypted here
    } = body

    if (!project_id || !provider_id) {
      return NextResponse.json({ error: 'project_id and provider_id are required' }, { status: 400 })
    }
    if (!credential_values || typeof credential_values !== 'object') {
      return NextResponse.json({ error: 'credential_values object is required' }, { status: 400 })
    }

    // ── Fetch provider to validate required fields ─────────────────────────
    const { data: provider } = await admin
      .from('integration_providers')
      .select('id, name, required_fields, auth_type, health_check_url')
      .eq('id', provider_id)
      .single()

    if (!provider) {
      return NextResponse.json({ error: 'Integration provider not found' }, { status: 404 })
    }

    const missingFields = (provider.required_fields || []).filter(
      (field: string) => !credential_values[field]
    )
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required credential fields: ${missingFields.join(', ')}` },
        { status: 400 }
      )
    }

    // ── Fetch workspace_id for credential storage ──────────────────────────
    const { data: projectRow } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', project_id)
      .single()

    if (!projectRow) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // ── Encrypt credential values ──────────────────────────────────────────
    let encryptedHex: string
    let keyRef: string

    try {
      const encrypted = encryptCredentialValues(credential_values)
      encryptedHex = encrypted.encryptedHex
      keyRef = encrypted.keyRef
    } catch (encErr) {
      return NextResponse.json(
        { error: 'Encryption configuration error. Set CREDENTIAL_ENCRYPTION_KEY.' },
        { status: 503 }
      )
    }

    // ── Store encrypted credentials ────────────────────────────────────────
    // Using admin client — credentials table requires service_role
    const { data: credential, error: credError } = await admin
      .from('credentials')
      .insert({
        workspace_id:       projectRow.workspace_id,
        provider_id,
        label:              label || `${provider.name} (${environment})`,
        encrypted_values:   Buffer.from(encryptedHex, 'hex'), // bytea
        encryption_key_ref: keyRef,
        is_active:          true,
        created_by:         user.id,
      })
      .select('id')
      .single()

    if (credError) throw new Error(`Failed to store credentials: ${credError.message}`)

    // ── Create or update project_integration ──────────────────────────────
    const { data: integration, error: intError } = await admin
      .from('project_integrations')
      .upsert(
        {
          project_id,
          provider_id,
          environment,
          status: 'active',
          credential_id: credential.id,
        },
        { onConflict: 'project_id,provider_id,environment' }
      )
      .select('id')
      .single()

    if (intError) throw new Error(`Failed to create integration: ${intError.message}`)

    // ── Store per-environment credential mapping ───────────────────────────
    try {
      await admin
        .from('integration_environment_credentials')
        .upsert(
          {
            integration_id: integration.id,
            environment,
            credential_id:  credential.id,
          },
          { onConflict: 'integration_id,environment' }
        )
    } catch { /* non-fatal: env credential mapping */ }

    // ── Audit log ─────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type: 'credential_created',
      actor_user_id: user.id,
      project_id,
      resource_type: 'credential',
      resource_id: credential.id,
      new_value: {
        provider_id,
        environment,
        label: label || `${provider.name} (${environment})`,
        // NOTE: credential_values are NEVER logged — only key_ref
        encryption_key_ref: keyRef,
      },
    })

    return NextResponse.json({
      data: {
        integration_id: integration.id,
        credential_id:  credential.id,
        provider_name:  provider.name,
        environment,
        status:         'active',
      }
    }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/integrations/connect?integration_id= — soft-delete
export async function DELETE(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get('integration_id')
    if (!integrationId) {
      return NextResponse.json({ error: 'integration_id required' }, { status: 400 })
    }

    // Soft-delete: set status to inactive + deactivate credentials
    const { data: integration } = await admin
      .from('project_integrations')
      .update({ status: 'inactive' })
      .eq('id', integrationId)
      .select('credential_id, project_id, provider_id')
      .single()

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Deactivate credential (soft-delete — RLS prevents hard delete)
    if (integration.credential_id) {
      await admin
        .from('credentials')
        .update({ is_active: false })
        .eq('id', integration.credential_id)
    }

    await writeAuditLog(admin, {
      event_type: 'credential_deleted',
      actor_user_id: user.id,
      project_id: integration.project_id,
      resource_type: 'integration',
      resource_id: integrationId,
      old_value: { status: 'active' },
      new_value: { status: 'inactive' },
    })

    return NextResponse.json({ data: { integration_id: integrationId, status: 'inactive' } })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
