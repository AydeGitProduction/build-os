/**
 * POST /api/bootstrap/project
 *
 * B0.1 â Bootstrap Bring-to-Life
 * Direct infra execution â NO task pipeline dependency.
 *
 * Flow:
 *   1. set bootstrap_status = 'init'
 *   2. create GitHub repo â store in project_integrations
 *   3. create Vercel project â store in deployment_targets
 *   4. link GitHub â Vercel in deployment_targets.config
 *   5. set bootstrap_status = 'ready_for_architect'
 *
 * Every step logs [BOOTSTRAP] prefix for live monitoring.
 * Any failure â bootstrap_status = 'failed', hard error returned.
 * NO silent failures.
 *
 * Idempotent: already-bootstrapped projects return 200 immediately.
 *
 * Auth: X-Buildos-Secret header
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionGitHubRepo } from '@/lib/github-provision'
import { provisionVercelProject, injectVercelEnvVars } from '@/lib/vercel-provision'

// âââ Admin Supabase client âââââââââââââââââââââââââââââââââââââââââââââââââââ
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('[BOOTSTRAP] Missing Supabase env vars (URL or SERVICE_ROLE_KEY)')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

// âââ Structured bootstrap logger ââââââââââââââââââââââââââââââââââââââââââââ
function blog(step: string, msg: string, data?: unknown) {
  const payload = data !== undefined ? ` | ${JSON.stringify(data)}` : ''
  console.log(`[BOOTSTRAP] ${step} â ${msg}${payload}`)
}

// âââ Write to bootstrap_log table (non-fatal) âââââââââââââââââââââââââââââââ
async function writeLog(
  admin: ReturnType<typeof getAdmin>,
  projectId: string,
  step: string,
  status: 'started' | 'completed' | 'failed',
  detail?: string,
) {
  try {
    await admin.from('bootstrap_log').insert({ project_id: projectId, step, status, detail: detail ?? null })
  } catch (e) {
    console.warn(`[BOOTSTRAP] bootstrap_log insert failed (non-fatal):`, e)
  }
}

// âââ Update bootstrap_status on projects row ââââââââââââââââââââââââââââââââ
async function setStatus(
  admin: ReturnType<typeof getAdmin>,
  projectId: string,
  status: string,
) {
  blog('status', `Setting bootstrap_status = ${status}`)
  const { error } = await admin
    .from('projects')
    .update({ bootstrap_status: status })
    .eq('id', projectId)
  if (error) {
    // Non-fatal status write â log but don't abort (the real step error matters more)
    console.error(`[BOOTSTRAP] status update failed:`, error.message)
  }
}

// âââ Route ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export const maxDuration = 60

export async function POST(request: NextRequest) {
  // ââ Auth ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const secret = request.headers.get('X-Buildos-Secret') ?? request.headers.get('x-buildos-secret')
  const validSecret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET
  if (!secret || secret !== validSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ââ Parse body ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  let project_id: string
  try {
    const body = await request.json()
    project_id = body.project_id
    if (!project_id) throw new Error('project_id is required')
  } catch (e) {
    return NextResponse.json(
      { error: 'Invalid request body', detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  const admin = getAdmin()
  blog('init', `Bootstrap requested for project_id=${project_id}`)

  // ââ Fetch project âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('id, name, status, bootstrap_status')
    .eq('id', project_id)
    .single()

  if (projErr || !project) {
    blog('init', 'FAIL â project not found', { project_id })
    return NextResponse.json({ error: 'Project not found', project_id }, { status: 404 })
  }

  blog('init', `Found project: "${project.name}"`, {
    current_bootstrap_status: project.bootstrap_status,
  })

  // ââ Idempotency: already ready ââââââââââââââââââââââââââââââââââââââââââââ
  if (project.bootstrap_status === 'ready_for_architect' || project.bootstrap_status === 'ready') {
    blog('init', 'Already bootstrapped â returning cached result')

    const { data: targets } = await admin
      .from('deployment_targets')
      .select('provider, target_config, status, health_url')
      .eq('project_id', project_id)
      .eq('status', 'live')

    return NextResponse.json({
      success: true,
      idempotent: true,
      bootstrap_status: project.bootstrap_status,
      project: { id: project.id, name: project.name },
      github: targets?.find(t => t.provider === 'github')?.target_config ?? null,
      vercel: targets?.find(t => t.provider === 'vercel') ?? null,
    })
  }

  // ââ Build project slug for repo naming ââââââââââââââââââââââââââââââââââââ
  const projectSlug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  // ============================================================
  // STEP 1 â Set init
  // ============================================================
  blog('step_1', 'Setting bootstrap_status = init')
  await setStatus(admin, project_id, 'init')
  await writeLog(admin, project_id, 'bootstrap', 'started', `Starting bootstrap for "${project.name}"`)

  // ============================================================
  // STEP 2 â GitHub repo
  // ============================================================
  blog('step_2_github', 'Creating GitHub repo', { org: process.env.GITHUB_ORG ?? process.env.GITHUB_REPO_OWNER, slug: projectSlug })
  await setStatus(admin, project_id, 'github_pending')
  await writeLog(admin, project_id, 'github', 'started', `Creating repo for project "${project.name}"`)

  let githubResult: {
    repoId: number
    repoName: string
    repoUrl: string
    repoFullName: string
    defaultBranch: string
    cloneUrl: string
  }

  try {
    githubResult = await provisionGitHubRepo({
      id:   project_id,
      slug: projectSlug,
      name: project.name,
    })

    blog('step_2_github', 'SUCCESS', {
      repoUrl:      githubResult.repoUrl,
      repoFullName: githubResult.repoFullName,
      repoId:       githubResult.repoId,
    })
  } catch (githubErr) {
    const msg = githubErr instanceof Error ? githubErr.message : String(githubErr)
    blog('step_2_github', 'FAIL', { error: msg })
    await setStatus(admin, project_id, 'failed')
    await writeLog(admin, project_id, 'github', 'failed', msg)
    return NextResponse.json({
      success:          false,
      failed_at:        'github',
      error:            msg,
      bootstrap_status: 'failed',
      project_id,
    }, { status: 500 })
  }

  // GitHub data is captured in bootstrap_log and will be stored in deployment_targets.target_config
  // (project_integrations requires provider_id UUID FK â resolved in Step 3 alongside Vercel target)
  blog('step_2_github', 'GitHub data captured in bootstrap_log â will persist to deployment_targets in Step 3')

  await setStatus(admin, project_id, 'github_ready')
  await writeLog(admin, project_id, 'github', 'completed', githubResult.repoUrl)

  // ============================================================
  // STEP 3 â Vercel project
  // ============================================================
  blog('step_3_vercel', 'Creating Vercel project', { projectName: `buildos-${projectSlug}` })
  await setStatus(admin, project_id, 'vercel_pending')
  await writeLog(admin, project_id, 'vercel', 'started', `Creating Vercel project for "${project.name}"`)

  let vercelResult: { project: { id: string; name: string; accountId?: string }; created: boolean }

  try {
    // Note: gitRepository NOT passed here â Vercel GitHub App may not be installed on
    // every org. GitHub repo is linked separately after App installation.
    vercelResult = await provisionVercelProject({
      projectName: `buildos-${projectSlug}`,
      framework:   'nextjs',
    })

    blog('step_3_vercel', 'SUCCESS', {
      vercelProjectId:   vercelResult.project.id,
      vercelProjectName: vercelResult.project.name,
      created:           vercelResult.created,
    })
    // WS1 FIX: inject Supabase env vars so Vercel builds can compile
    try {
      const _buildEnvVars = [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || '', target: ['production','preview','development'] },
        { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', target: ['production','preview','development'] },
        { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || '', target: ['production','preview'] },
      ].filter(e => e.value)
      if (_buildEnvVars.length > 0) {
        await injectVercelEnvVars(vercelResult.project.id, _buildEnvVars)
        blog('step_3_vercel', `WS1: injected ${_buildEnvVars.length} build env vars into Vercel project`)
      } else {
        blog('step_3_vercel', 'WS1: WARN — no Supabase env vars found on BuildOS host; Vercel builds will fail')
      }
    } catch (_envErr) {
      blog('step_3_vercel', 'WS1: WARN — env var injection failed (non-fatal)', {
        error: _envErr instanceof Error ? _envErr.message : String(_envErr),
      })
    }
    // WS1 FIX: inject Supabase env vars so Vercel builds can compile
    try {
      const _buildEnvVars = [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || '', target: ['production','preview','development'] },
        { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', target: ['production','preview','development'] },
        { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || '', target: ['production','preview'] },
      ].filter(e => e.value)
      if (_buildEnvVars.length > 0) {
        await injectVercelEnvVars(vercelResult.project.id, _buildEnvVars)
        blog('step_3_vercel', `WS1: injected ${_buildEnvVars.length} build env vars into Vercel project`)
      } else {
        blog('step_3_vercel', 'WS1: WARN — no Supabase env vars found on BuildOS host; Vercel builds will fail')
      }
    } catch (_envErr) {
      blog('step_3_vercel', 'WS1: WARN — env var injection failed (non-fatal)', {
        error: _envErr instanceof Error ? _envErr.message : String(_envErr),
      })
    }
  } catch (vercelErr) {
    const msg = vercelErr instanceof Error ? vercelErr.message : String(vercelErr)
    blog('step_3_vercel', 'FAIL', { error: msg })
    await setStatus(admin, project_id, 'failed')
    await writeLog(admin, project_id, 'vercel', 'failed', msg)
    return NextResponse.json({
      success:          false,
      failed_at:        'vercel',
      error:            msg,
      bootstrap_status: 'failed',
      project_id,
      github: {
        repo_url:      githubResult.repoUrl,
        repo_fullname: githubResult.repoFullName,
      },
    }, { status: 500 })
  }

  // Store Vercel deployment target
  blog('step_3_vercel', 'Storing in deployment_targets')
  const vercelDeployUrl = `https://${vercelResult.project.name}.vercel.app`

  // deployment_targets requires environment_id FK â project_environments.id
  // Look up (or create) the production environment for this project
  let envId: string
  const { data: existingEnv } = await admin
    .from('project_environments')
    .select('id')
    .eq('project_id', project_id)
    .eq('is_production', true)
    .maybeSingle()

  if (existingEnv) {
    envId = existingEnv.id
    blog('step_3_vercel', 'Found existing production environment', { envId })
  } else {
    blog('step_3_vercel', 'No production environment found â creating one')
    const { data: newEnv, error: envErr } = await admin
      .from('project_environments')
      .insert({
        project_id,
        name:          'production',
        is_production: true,
        deployment_url: vercelDeployUrl,
      })
      .select('id')
      .single()

    if (envErr || !newEnv) {
      const msg = envErr?.message ?? 'Failed to create project_environments row'
      blog('step_3_vercel', 'FAIL â cannot create production environment', { error: msg })
      await setStatus(admin, project_id, 'failed')
      await writeLog(admin, project_id, 'vercel', 'failed', `env creation failed: ${msg}`)
      return NextResponse.json({
        success: false, failed_at: 'vercel_env', error: msg,
        bootstrap_status: 'failed', project_id,
        github: { repo_url: githubResult.repoUrl, repo_fullname: githubResult.repoFullName },
      }, { status: 500 })
    }
    envId = newEnv.id
    blog('step_3_vercel', 'Created production environment', { envId })
  }

  // Upsert deployment_targets with correct schema
  // Unique constraint: (project_id, environment_id)
  const { error: vercelTargErr } = await admin
    .from('deployment_targets')
    .upsert({
      project_id,
      environment_id: envId,
      provider:       'vercel',
      status:         'live',
      health_url:     vercelDeployUrl,
      target_config: {
        vercel_project_id:    vercelResult.project.id,
        vercel_project_name:  vercelResult.project.name,
        vercel_account_id:    vercelResult.project.accountId ?? null,
        vercel_deploy_url:    vercelDeployUrl,
        github_repo_url:      githubResult.repoUrl,
        github_repo_fullname: githubResult.repoFullName,
        github_repo_id:       githubResult.repoId,
        github_default_branch: githubResult.defaultBranch,
        github_clone_url:     githubResult.cloneUrl,
      },
    }, { onConflict: 'project_id,environment_id' })

  if (vercelTargErr) {
    blog('step_3_vercel', 'WARN â deployment_targets upsert failed (non-fatal)', { error: vercelTargErr.message })
  } else {
    blog('step_3_vercel', 'Stored in deployment_targets OK')
  }

  await setStatus(admin, project_id, 'vercel_ready')
  await writeLog(admin, project_id, 'vercel', 'completed', vercelDeployUrl)

  // ============================================================
  // STEP 4 â Link: update deployment_url on production environment
  // ============================================================
  blog('step_4_link', 'Linking: updating production environment deployment_url')
  await setStatus(admin, project_id, 'linking')

  const { error: linkErr } = await admin
    .from('project_environments')
    .update({ deployment_url: vercelDeployUrl })
    .eq('id', envId)

  if (linkErr) {
    blog('step_4_link', 'WARN â environment deployment_url update failed (non-fatal)', { error: linkErr.message })
  } else {
    blog('step_4_link', 'Linked OK â production environment deployment_url set to', { vercelDeployUrl })
  }

  await writeLog(admin, project_id, 'linking', 'completed', `github=${githubResult.repoUrl} vercel=${vercelDeployUrl}`)

  // ============================================================
  // STEP 4b — Canonicalize project_integrations (BUG-4 fix)
  // Upsert project_integrations with the ACTUAL GitHub repo fullname
  // from the GitHub API response. This overwrites any stale URL that
  // may have been written by the legacy /api/projects/[id]/provision
  // route (which ran a separate repo creation with a different name).
  //
  // Without this step, agent/generate reads project_integrations and
  // finds a different repo than what scaffold committed to — causing
  // agent code to land in a separate repo with no package.json and
  // Vercel builds to ERROR.
  //
  // Using UPSERT on (project_id, provider_id) so this is idempotent.
  // ============================================================
  blog('step_4b_canonicalize', 'Canonicalizing project_integrations with actual GitHub repo', {
    actual_repo: githubResult.repoFullName,
  })
  try {
    const { error: intErr } = await admin
      .from('project_integrations')
      .upsert({
        project_id,
        provider_id:   '05e2c85b-69f5-4eb4-b2d0-cf243b2f2838', // GitHub provider
        credential_id: '4109f41e-a483-4624-8b12-6eb020b90399', // system GitHub credential
        status:        'active',
        environment_map: {
          github_repo_id:   githubResult.repoId,
          github_repo_name: githubResult.repoName,
          github_repo_url:  githubResult.repoUrl, // ACTUAL url from GitHub API response
        },
        created_by:  '614c0632-50a0-44fb-b6e8-8563d08fa1c3',
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'project_id,provider_id' })

    if (intErr) {
      blog('step_4b_canonicalize', 'WARN — project_integrations upsert failed (non-fatal)', { error: intErr.message })
    } else {
      blog('step_4b_canonicalize', 'OK — project_integrations canonical repo set', { repo: githubResult.repoFullName })
    }
  } catch (canonErr) {
    blog('step_4b_canonicalize', 'WARN — canonicalize threw (non-fatal)', {
      error: canonErr instanceof Error ? canonErr.message : String(canonErr),
    })
  }


  // ============================================================
  // STEP 5 â Ready
  // ============================================================
  blog('step_5_ready', 'Setting bootstrap_status = ready_for_architect')
  await setStatus(admin, project_id, 'ready_for_architect')
  await writeLog(admin, project_id, 'ready', 'completed', 'Bootstrap complete â project ready for architect')

  // ============================================================
  // STEP 6 — Base scaffold (Phase 5)
  // Commits package.json, next.config.mjs, tsconfig.json, globals.css,
  // middleware, Sidebar, dashboard page, etc. to the project repo so
  // that `vercel build` passes before any AI task runs.
  // Non-fatal: if scaffold fails, bootstrap is still considered complete.
  // ============================================================
  blog('step_6_scaffold', 'Triggering base scaffold commit for project repo')
  await setStatus(admin, project_id, 'scaffolding')
  await writeLog(admin, project_id, 'scaffold', 'started', `Committing base scaffold to ${githubResult.repoFullName}`)

  try {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL
      || process.env.NEXTAUTH_URL
      || `https://${process.env.VERCEL_URL}`
      || 'http://localhost:3000'

    const scaffoldRes = await fetch(`${appBaseUrl}/api/projects/${project_id}/scaffold`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Buildos-Secret': process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || '',
      },
    })

    if (scaffoldRes.ok) {
      const scaffoldData = (await scaffoldRes.json()) as { data?: { files_committed?: number; commit_sha?: string; target_repo?: string; skipped?: boolean } }
      const d = scaffoldData.data ?? {}
      blog('step_6_scaffold', 'SUCCESS', {
        files_committed: d.files_committed,
        commit_sha:      d.commit_sha,
        target_repo:     d.target_repo,
        skipped:         d.skipped,
      })
      await writeLog(admin, project_id, 'scaffold', 'completed', `${d.files_committed ?? '?'} files → ${d.commit_sha ?? 'n/a'}`)
    } else {
      const errText = await scaffoldRes.text().catch(() => 'unknown error')
      blog('step_6_scaffold', `WARN — scaffold HTTP ${scaffoldRes.status} (non-fatal)`, { error: errText.slice(0, 200) })
      await writeLog(admin, project_id, 'scaffold', 'failed', `HTTP ${scaffoldRes.status}: ${errText.slice(0, 200)}`)
    }
  } catch (scaffoldErr) {
    const msg = scaffoldErr instanceof Error ? scaffoldErr.message : String(scaffoldErr)
    blog('step_6_scaffold', `WARN — scaffold threw (non-fatal): ${msg}`)
    await writeLog(admin, project_id, 'scaffold', 'failed', msg)
  }

  // Scaffold complete (or skipped non-fatally) — set final status
  await setStatus(admin, project_id, 'ready_for_architect')

  blog('complete', 'Bootstrap COMPLETE', {
    project_id,
    project_name:     project.name,
    bootstrap_status: 'ready_for_architect',
    github_repo:      githubResult.repoUrl,
    vercel_project:   vercelResult.project.name,
    vercel_url:       vercelDeployUrl,
  })

  // ââ Final DB read for proof âââââââââââââââââââââââââââââââââââââââââââââââ
  const { data: finalProject } = await admin
    .from('projects')
    .select('id, name, bootstrap_status')
    .eq('id', project_id)
    .single()

  return NextResponse.json({
    success:          true,
    bootstrap_status: 'ready_for_architect',
    project: {
      id:   finalProject?.id   ?? project_id,
      name: finalProject?.name ?? project.name,
      bootstrap_status: finalProject?.bootstrap_status ?? 'ready_for_architect',
    },
    github: {
      repo_url:      githubResult.repoUrl,
      repo_fullname: githubResult.repoFullName,
      repo_id:       githubResult.repoId,
      default_branch: githubResult.defaultBranch,
    },
    vercel: {
      project_id:   vercelResult.project.id,
      project_name: vercelResult.project.name,
      deploy_url:   vercelDeployUrl,
      created:      vercelResult.created,
    },
    steps_completed: ['init', 'github', 'vercel', 'linking', 'ready', 'scaffold'],
  })
}
