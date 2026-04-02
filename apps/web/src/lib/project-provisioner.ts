// apps/web/src/lib/project-provisioner.ts

import { createClient } from '@/lib/supabase/server'
import { GitHubProvisioner } from '@/lib/github-provisioner'
import { VercelProvisioner } from '@/lib/vercel-provisioner'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProvisioningStatus =
  | 'pending'
  | 'provisioning'
  | 'provisioned'
  | 'failed'
  | 'timed_out'

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export interface ProvisioningStep {
  name: string
  status: StepStatus
  startedAt?: string
  completedAt?: string
  error?: string
  result?: Record<string, unknown>
}

export interface ProvisioningMetadata {
  github?: {
    status: StepStatus
    repoUrl?: string
    repoFullName?: string
    repoId?: number
    defaultBranch?: string
    error?: string
  }
  vercel?: {
    status: StepStatus
    projectId?: string
    projectUrl?: string
    teamId?: string
    error?: string
  }
  deploymentTarget?: {
    status: StepStatus
    recordId?: string
    error?: string
  }
  integrations?: {
    status: StepStatus
    error?: string
  }
  envVars?: {
    status: StepStatus
    error?: string
  }
  steps: ProvisioningStep[]
}

export interface ProvisioningResult {
  success: boolean
  projectId: string
  status: ProvisioningStatus
  metadata: ProvisioningMetadata
  errors: string[]
  partial: boolean
}

export interface ProjectRecord {
  id: string
  name: string
  slug: string
  workspace_id: string
  provisioning_status: ProvisioningStatus
  provisioning_metadata: ProvisioningMetadata | null
  provisioning_started_at: string | null
  provisioning_completed_at: string | null
}

export interface WorkspaceRecord {
  id: string
  name: string
  slug: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROVISIONING_TIMEOUT_MS = 120_000 // 2 minutes
const CORE_PROJECT_ID = 'feb25dda-0000-0000-0000-000000000000' // Protected core project

// Safe core project IDs that must never be reprovisioned
// These are matched as prefix to handle various UUID formats
const PROTECTED_PROJECT_PREFIXES = ['feb25dda']

// ─── ProjectProvisioner ───────────────────────────────────────────────────────

export class ProjectProvisioner {
  private supabase: Awaited<ReturnType<typeof createClient>>
  private githubProvisioner: GitHubProvisioner
  private vercelProvisioner: VercelProvisioner

  constructor(
    supabase: Awaited<ReturnType<typeof createClient>>,
    githubProvisioner?: GitHubProvisioner,
    vercelProvisioner?: VercelProvisioner,
  ) {
    this.supabase = supabase
    this.githubProvisioner = githubProvisioner ?? new GitHubProvisioner()
    this.vercelProvisioner = vercelProvisioner ?? new VercelProvisioner()
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Main orchestration entry point.
   * Provisions all infrastructure for a newly created project.
   */
  async provisionProject(projectId: string): Promise<ProvisioningResult> {
    const errors: string[] = []
    const metadata: ProvisioningMetadata = { steps: [] }

    // ── Guard: protect core/reserved projects ──────────────────────────────
    if (this.isProtectedProject(projectId)) {
      console.log(`[ProjectProvisioner] Skipping protected project: ${projectId}`)
      return this.buildResult(projectId, true, 'provisioned', metadata, [], false)
    }

    // ── Load project + workspace ───────────────────────────────────────────
    const { project, workspace, error: loadError } =
      await this.loadProjectAndWorkspace(projectId)

    if (loadError || !project || !workspace) {
      const msg = loadError ?? 'Project or workspace not found'
      return this.buildResult(projectId, false, 'failed', metadata, [msg], false)
    }

    // ── Guard: duplicate provisioning check ────────────────────────────────
    const dupeCheck = this.checkForDuplicateProvisioning(project)
    if (dupeCheck.skip) {
      console.log(
        `[ProjectProvisioner] Skipping — project ${projectId} already has status: ${project.provisioning_status}`,
      )
      return this.buildResult(
        projectId,
        dupeCheck.success,
        project.provisioning_status,
        project.provisioning_metadata ?? metadata,
        [],
        false,
      )
    }

    // ── Mark as provisioning ───────────────────────────────────────────────
    await this.setProvisioningStatus(projectId, 'provisioning', metadata)

    // ── Set up timeout race ────────────────────────────────────────────────
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Provisioning timed out after ${PROVISIONING_TIMEOUT_MS}ms`)),
        PROVISIONING_TIMEOUT_MS,
      ),
    )

    try {
      const result = await Promise.race([
        this.runProvisioningSteps(projectId, project, workspace, metadata, errors),
        timeoutPromise,
      ])
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isTimed = msg.includes('timed out')

      errors.push(msg)
      const finalStatus: ProvisioningStatus = isTimed ? 'timed_out' : 'failed'

      await this.setProvisioningStatus(projectId, finalStatus, metadata, errors)

      console.error(`[ProjectProvisioner] Provisioning ${finalStatus} for ${projectId}:`, msg)

      return this.buildResult(projectId, false, finalStatus, metadata, errors, true)
    }
  }

  // ─── Core Provisioning Steps ───────────────────────────────────────────────

  private async runProvisioningSteps(
    projectId: string,
    project: ProjectRecord,
    workspace: WorkspaceRecord,
    metadata: ProvisioningMetadata,
    errors: string[],
  ): Promise<ProvisioningResult> {
    let partial = false

    // ── Step A: Provision GitHub Repo ──────────────────────────────────────
    const githubResult = await this.runStep(
      'github-provisioning',
      metadata,
      async () => {
        const result = await this.githubProvisioner.provisionRepoForProject({
          projectId,
          projectName: project.name,
          projectSlug: project.slug,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug,
        })

        if (!result.success) {
          throw new Error(result.error ?? 'GitHub provisioning failed')
        }

        metadata.github = {
          status: 'success',
          repoUrl: result.repoUrl,
          repoFullName: result.repoFullName,
          repoId: result.repoId,
          defaultBranch: result.defaultBranch ?? 'main',
        }

        return result
      },
      (err) => {
        metadata.github = { status: 'failed', error: err.message }
        errors.push(`GitHub: ${err.message}`)
        partial = true
      },
    )

    // ── Step B: Provision Vercel Project ───────────────────────────────────
    const vercelResult = await this.runStep(
      'vercel-provisioning',
      metadata,
      async () => {
        const result = await this.vercelProvisioner.provisionProjectForProject({
          projectId,
          projectName: project.name,
          projectSlug: project.slug,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          githubRepoFullName: githubResult?.repoFullName,
        })

        if (!result.success) {
          throw new Error(result.error ?? 'Vercel provisioning failed')
        }

        metadata.vercel = {
          status: 'success',
          projectId: result.vercelProjectId,
          projectUrl: result.projectUrl,
          teamId: result.teamId,
        }

        return result
      },
      (err) => {
        metadata.vercel = { status: 'failed', error: err.message }
        errors.push(`Vercel: ${err.message}`)
        partial = true
      },
    )

    // ── Step C: Update deployment_targets ─────────────────────────────────
    await this.runStep(
      'deployment-targets',
      metadata,
      async () => {
        await this.upsertDeploymentTarget(projectId, {
          githubRepoUrl: githubResult?.repoUrl,
          githubRepoFullName: githubResult?.repoFullName,
          vercelProjectId: vercelResult?.vercelProjectId,
          vercelProjectUrl: vercelResult?.projectUrl,
          vercelTeamId: vercelResult?.teamId,
        })

        metadata.deploymentTarget = { status: 'success' }
      },
      (err) => {
        metadata.deploymentTarget = { status: 'failed', error: err.message }
        errors.push(`DeploymentTarget: ${err.message}`)
        partial = true
      },
    )

    // ── Step D: Update project_integrations ───────────────────────────────
    await this.runStep(
      'project-integrations',
      metadata,
      async () => {
        await this.upsertProjectIntegrations(projectId, {
          github: githubResult
            ? {
                externalId: String(githubResult.repoId ?? githubResult.repoFullName),
                externalUrl: githubResult.repoUrl,
                metadata: {
                  repoFullName: githubResult.repoFullName,
                  defaultBranch: githubResult.defaultBranch ?? 'main',
                  repoId: githubResult.repoId,
                },
              }
            : undefined,
          vercel: vercelResult
            ? {
                externalId: vercelResult.vercelProjectId,
                externalUrl: vercelResult.projectUrl,
                metadata: {
                  teamId: vercelResult.teamId,
                  framework: vercelResult.framework,
                },
              }
            : undefined,
        })

        metadata.integrations = { status: 'success' }
      },
      (err) => {
        metadata.integrations = { status: 'failed', error: err.message }
        errors.push(`Integrations: ${err.message}`)
        partial = true
      },
    )

    // ── Step E: Update project_environments with deploy URL ───────────────
    await this.runStep(
      'env-vars',
      metadata,
      async () => {
        const deployUrl = vercelResult?.projectUrl
        if (deployUrl) {
          await this.updateProjectEnvironmentVars(projectId, {
            NEXT_PUBLIC_DEPLOY_URL: deployUrl,
            VERCEL_PROJECT_ID: vercelResult?.vercelProjectId ?? '',
          })
        }

        metadata.envVars = { status: 'success' }
      },
      (err) => {
        metadata.envVars = { status: 'failed', error: err.message }
        errors.push(`EnvVars: ${err.message}`)
        partial = true
      },
    )

    // ── Finalize ──────────────────────────────────────────────────────────
    const overallSuccess = errors.length === 0
    const finalStatus: ProvisioningStatus = overallSuccess ? 'provisioned' : 'failed'

    await this.setProvisioningStatus(projectId, finalStatus, metadata, errors)

    console.log(
      `[ProjectProvisioner] Provisioning complete for ${projectId}: ${finalStatus}` +
        (partial ? ` (partial — ${errors.length} step(s) failed)` : ''),
    )

    return this.buildResult(projectId, overallSuccess, finalStatus, metadata, errors, partial)
  }

  // ─── Step Runner ──────────────────────────────────────────────────────────

  private async runStep<T>(
    stepName: string,
    metadata: ProvisioningMetadata,
    fn: () => Promise<T>,
    onError: (err: Error) => void,
  ): Promise<T | undefined> {
    const step: ProvisioningStep = {
      name: stepName,
      status: 'running',
      startedAt: new Date().toISOString(),
    }
    metadata.steps.push(step)

    try {
      const result = await fn()
      step.status = 'success'
      step.completedAt = new Date().toISOString()
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      step.status = 'failed'
      step.completedAt = new Date().toISOString()
      step.error = error.message

      console.error(`[ProjectProvisioner] Step "${stepName}" failed:`, error.message)
      onError(error)
      return undefined
    }
  }

  // ─── DB Helpers ───────────────────────────────────────────────────────────

  private async loadProjectAndWorkspace(projectId: string): Promise<{
    project: ProjectRecord | null
    workspace: WorkspaceRecord | null
    error: string | null
  }> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select(
        'id, name, slug, workspace_id, provisioning_status, provisioning_metadata, provisioning_started_at, provisioning_completed_at',
      )
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return {
        project: null,
        workspace: null,
        error: projectError?.message ?? 'Project not found',
      }
    }

    const { data: workspace, error: workspaceError } = await this.supabase
      .from('workspaces')
      .select('id, name, slug')
      .eq('id', project.workspace_id)
      .single()

    if (workspaceError || !workspace) {
      return {
        project: project as ProjectRecord,
        workspace: null,
        error: workspaceError?.message ?? 'Workspace not found',
      }
    }

    return {
      project: project as ProjectRecord,
      workspace: workspace as WorkspaceRecord,
      error: null,
    }
  }

  private async setProvisioningStatus(
    projectId: string,
    status: ProvisioningStatus,
    metadata: ProvisioningMetadata,
    errors?: string[],
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      provisioning_status: status,
      provisioning_metadata: {
        ...metadata,
        errors: errors ?? [],
        lastUpdated: new Date().toISOString(),
      },
    }

    if (status === 'provisioning') {
      updates.provisioning_started_at = new Date().toISOString()
    }

    if (status === 'provisioned' || status === 'failed' || status === 'timed_out') {
      updates.provisioning_completed_at = new Date().toISOString()
    }

    const { error } = await this.supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)

    if (error) {
      console.error(
        `[ProjectProvisioner] Failed to update provisioning status for ${projectId}:`,
        error,
      )
    }
  }

  private async upsertDeploymentTarget(
    projectId: string,
    data: {
      githubRepoUrl?: string
      githubRepoFullName?: string
      vercelProjectId?: string
      vercelProjectUrl?: string
      vercelTeamId?: string
    },
  ): Promise<void> {
    const { error } = await this.supabase
      .from('deployment_targets')
      .upsert(
        {
          project_id: projectId,
          github_repo_url: data.githubRepoUrl,
          github_repo_full_name: data.githubRepoFullName,
          vercel_project_id: data.vercelProjectId,
          vercel_project_url: data.vercelProjectUrl,
          vercel_team_id: data.vercelTeamId,
          provisioned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' },
      )

    if (error) {
      throw new Error(`Failed to upsert deployment_targets: ${error.message}`)
    }
  }

  private async upsertProjectIntegrations(
    projectId: string,
    integrations: {
      github?: {
        externalId: string
        externalUrl?: string
        metadata?: Record<string, unknown>
      }
      vercel?: {
        externalId: string
        externalUrl?: string
        metadata?: Record<string, unknown>
      }
    },
  ): Promise<void> {
    const rows = []

    if (integrations.github) {
      rows.push({
        project_id: projectId,
        provider: 'github',
        external_id: integrations.github.externalId,
        external_url: integrations.github.externalUrl,
        metadata: integrations.github.metadata ?? {},
        updated_at: new Date().toISOString(),
      })
    }

    if (integrations.vercel) {
      rows.push({
        project_id: projectId,
        provider: 'vercel',
        external_id: integrations.vercel.externalId,
        external_url: integrations.vercel.externalUrl,
        metadata: integrations.vercel.metadata ?? {},
        updated_at: new Date().toISOString(),
      })
    }

    if (rows.length === 0) return

    const { error } = await this.supabase
      .from('project_integrations')
      .upsert(rows, { onConflict: 'project_id,provider' })

    if (error) {
      throw new Error(`Failed to upsert project_integrations: ${error.message}`)
    }
  }

  private async updateProjectEnvironmentVars(
    projectId: string,
    vars: Record<string, string>,
  ): Promise<void> {
    // Fetch existing environments for this project
    const { data: environments, error: fetchError } = await this.supabase
      .from('project_environments')
      .select('id, variables')
      .eq('project_id', projectId)

    if (fetchError) {
      throw new Error(`Failed to fetch project environments: ${fetchError.message}`)
    }

    if (!environments || environments.length === 0) {
      // No environments yet — create a default one
      const { error: insertError } = await this.supabase
        .from('project_environments')
        .insert({
          project_id: projectId,
          name: 'production',
          variables: vars,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (insertError) {
        throw new Error(`Failed to create project environment: ${insertError.message}`)
      }
      return
    }

    // Update all existing environments with the new vars
    for (const env of environments) {
      const mergedVars = {
        ...(env.variables as Record<string, string> ?? {}),
        ...vars,
      }

      const { error: updateError } = await this.supabase
        .from('project_environments')
        .update({
          variables: mergedVars,
          updated_at: new Date().toISOString(),
        })
        .eq('id', env.id)

      if (updateError) {
        throw new Error(`Failed to update environment ${env.id}: ${updateError.message}`)
      }
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private isProtectedProject(projectId: string): boolean {
    return PROTECTED_PROJECT_PREFIXES.some((prefix) =>
      projectId.toLowerCase().startsWith(prefix.toLowerCase()),
    )
  }

  private checkForDuplicateProvisioning(project: ProjectRecord): {
    skip: boolean
    success: boolean
  } {
    switch (project.provisioning_status) {
      case 'provisioned':
        return { skip: true, success: true }
      case 'provisioning':
        // In-flight — don't re-trigger (could be a concurrent request)
        return { skip: true, success: false }
      case 'pending':
      case 'failed':
      case 'timed_out':
        // Retryable states
        return { skip: false, success: false }
      default:
        return { skip: false, success: false }
    }
  }

  private buildResult(
    projectId: string,
    success: boolean,
    status: ProvisioningStatus,
    metadata: ProvisioningMetadata,
    errors: string[],
    partial: boolean,
  ): ProvisioningResult {
    return { success, projectId, status, metadata, errors, partial }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a ProjectProvisioner instance bound to the current request's
 * Supabase client (server-side, with auth context).
 */
export async function createProjectProvisioner(): Promise<ProjectProvisioner> {
  const supabase = await createClient()
  return new ProjectProvisioner(supabase)
}