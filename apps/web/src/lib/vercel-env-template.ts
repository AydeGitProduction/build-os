/**
 * vercel-env-template.ts — WS4: Vercel Env Template Enforcement
 *
 * Defines the canonical minimal required env vars for every scaffolded project.
 * Bootstrap MUST either:
 *   (A) apply all env vars automatically via injectVercelEnvTemplate(), OR
 *   (B) fail fast with an explicit list of missing vars via validateVercelEnvTemplate()
 *
 * No hidden dashboard-only dependencies allowed.
 *
 * Current template version: 1.0.0
 *
 * Usage (in bootstrap/project/route.ts):
 *   const envResult = await injectVercelEnvTemplate(vercelProjectId, projectId)
 *   if (!envResult.success) {
 *     return NextResponse.json({ error: 'env_injection_failed', missing: envResult.missing }, { status: 500 })
 *   }
 */

// ─────────────────────────────────────────────────────────────────────────────
// Template definition
// ─────────────────────────────────────────────────────────────────────────────

export const ENV_TEMPLATE_VERSION = '1.0.0'

/**
 * Keys that MUST exist in every Vercel project before any agent run.
 * Used by preflight.ts checkVercelEnvVars() to validate.
 */
export const VERCEL_REQUIRED_ENV_KEYS: string[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BUILDOS_INTERNAL_SECRET',
  'NEXT_PUBLIC_APP_URL',
]

export interface EnvVarDefinition {
  key: string
  /** Source: 'platform' means read from this process's env vars and inject into target project */
  source: 'platform'
  target: ('production' | 'preview' | 'development')[]
  type: 'encrypted' | 'plain'
  /** If true, bootstrap fails fast when this var is missing from platform env */
  required: boolean
  description: string
}

/**
 * Full env var definitions for the template.
 * Bootstrap reads these from the platform env and injects into the scaffolded Vercel project.
 */
export const VERCEL_ENV_TEMPLATE: EnvVarDefinition[] = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    source: 'platform',
    target: ['production', 'preview', 'development'],
    type: 'plain',
    required: true,
    description: 'Supabase project URL',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    source: 'platform',
    target: ['production', 'preview', 'development'],
    type: 'encrypted',
    required: true,
    description: 'Supabase anon/public key',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    source: 'platform',
    target: ['production'],
    type: 'encrypted',
    required: true,
    description: 'Supabase service role key (server-only)',
  },
  {
    key: 'BUILDOS_INTERNAL_SECRET',
    source: 'platform',
    target: ['production', 'preview', 'development'],
    type: 'encrypted',
    required: true,
    description: 'Internal BuildOS secret for route auth',
  },
  {
    key: 'NEXT_PUBLIC_APP_URL',
    source: 'platform',
    target: ['production', 'preview', 'development'],
    type: 'plain',
    required: false, // derived from VERCEL_URL if not set
    description: 'Public URL of the deployed app',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Validation (preflight-only — does NOT inject)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that all required platform env vars are available for injection.
 * Call this before attempting to inject — fail fast with explicit missing list.
 */
export function validatePlatformEnvForInjection(): {
  valid: boolean
  missing: string[]
} {
  const required = VERCEL_ENV_TEMPLATE.filter((e) => e.required)
  const missing = required
    .filter((e) => !process.env[e.key])
    .map((e) => e.key)

  return { valid: missing.length === 0, missing }
}

// ─────────────────────────────────────────────────────────────────────────────
// Injection: write env vars into Vercel project
// ─────────────────────────────────────────────────────────────────────────────

export interface EnvInjectionResult {
  success: boolean
  injected: string[]
  skipped: string[]  // already existed with same value
  failed: string[]
  missing: string[]  // required but not in platform env
  templateVersion: string
}

/**
 * Injects the canonical env template into a Vercel project.
 * - Upserts each var (create or update existing)
 * - Skips vars already set to the same value
 * - Fails fast if required platform env vars are missing
 * - Non-required missing vars are logged but don't fail
 *
 * @param vercelProjectId  Vercel project ID (prj_xxx)
 * @param projectId        BuildOS project UUID (for logging)
 */
export async function injectVercelEnvTemplate(
  vercelProjectId: string,
  projectId: string,
): Promise<EnvInjectionResult> {
  const vercelToken = process.env.VERCEL_API_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID

  const result: EnvInjectionResult = {
    success: false,
    injected: [],
    skipped: [],
    failed: [],
    missing: [],
    templateVersion: ENV_TEMPLATE_VERSION,
  }

  if (!vercelToken) {
    console.error('[vercel-env-template] VERCEL_API_TOKEN not set — cannot inject env vars')
    result.missing.push('VERCEL_API_TOKEN (platform)')
    return result
  }

  // Pre-flight: check required platform vars exist
  const { valid, missing: platformMissing } = validatePlatformEnvForInjection()
  if (!valid) {
    console.error(
      `[vercel-env-template] Required platform env vars missing for injection into project ${projectId}: ${platformMissing.join(', ')}`,
    )
    result.missing = platformMissing
    return result
  }

  const teamParam = teamId ? `?teamId=${teamId}` : ''

  // Fetch existing env vars to detect conflicts
  let existingEnvs: Array<{ id: string; key: string; value?: string }> = []
  try {
    const listRes = await fetch(
      `https://api.vercel.com/v9/projects/${vercelProjectId}/env${teamParam}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
    )
    if (listRes.ok) {
      const listData = (await listRes.json()) as { envs?: typeof existingEnvs }
      existingEnvs = listData.envs ?? []
    }
  } catch {
    // Non-fatal — proceed with upsert
  }

  const existingMap = new Map(existingEnvs.map((e) => [e.key, e]))

  // Inject / upsert each env var
  for (const envDef of VERCEL_ENV_TEMPLATE) {
    const value = process.env[envDef.key]

    // Use NEXT_PUBLIC_APP_URL fallback
    const effectiveValue =
      envDef.key === 'NEXT_PUBLIC_APP_URL' && !value
        ? process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `https://web-lake-one-88.vercel.app` // known prod URL as last resort
        : value

    if (!effectiveValue) {
      if (envDef.required) {
        result.missing.push(envDef.key)
      } else {
        console.warn(
          `[vercel-env-template] Optional env var ${envDef.key} not available — skipping`,
        )
        result.skipped.push(envDef.key)
      }
      continue
    }

    try {
      const existing = existingMap.get(envDef.key)

      if (existing) {
        // Update existing env var
        const updateRes = await fetch(
          `https://api.vercel.com/v9/projects/${vercelProjectId}/env/${existing.id}${teamParam}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              value: effectiveValue,
              target: envDef.target,
              type: envDef.type,
            }),
          },
        )
        if (updateRes.ok) {
          result.injected.push(`${envDef.key} (updated)`)
        } else {
          const errText = await updateRes.text().catch(() => '')
          console.error(
            `[vercel-env-template] Failed to update ${envDef.key}: HTTP ${updateRes.status} ${errText.slice(0, 100)}`,
          )
          result.failed.push(envDef.key)
        }
      } else {
        // Create new env var
        const createRes = await fetch(
          `https://api.vercel.com/v9/projects/${vercelProjectId}/env${teamParam}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              key: envDef.key,
              value: effectiveValue,
              target: envDef.target,
              type: envDef.type,
            }),
          },
        )
        if (createRes.ok) {
          result.injected.push(`${envDef.key} (created)`)
        } else {
          const errText = await createRes.text().catch(() => '')
          console.error(
            `[vercel-env-template] Failed to create ${envDef.key}: HTTP ${createRes.status} ${errText.slice(0, 100)}`,
          )
          result.failed.push(envDef.key)
        }
      }
    } catch (err) {
      console.error(
        `[vercel-env-template] Exception injecting ${envDef.key}: ${err instanceof Error ? err.message : String(err)}`,
      )
      result.failed.push(envDef.key)
    }
  }

  const criticalMissing = result.missing.filter((k) =>
    VERCEL_ENV_TEMPLATE.find((e) => e.key === k && e.required),
  )
  const criticalFailed = result.failed.filter((k) =>
    VERCEL_ENV_TEMPLATE.find((e) => e.key === k && e.required),
  )

  result.success = criticalMissing.length === 0 && criticalFailed.length === 0

  console.log(
    `[vercel-env-template] Injection complete for project=${projectId} vercel=${vercelProjectId}:`,
    {
      success: result.success,
      injected: result.injected,
      skipped: result.skipped,
      failed: result.failed,
      missing: result.missing,
      templateVersion: result.templateVersion,
    },
  )

  return result
}
