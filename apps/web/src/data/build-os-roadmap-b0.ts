/**
 * BUILD OS — B0: Bootstrap Engine Rebuild
 *
 * MANDATE: Fix project creation so EVERY project is correctly created,
 * linked, and ready BEFORE any tasks run.
 *
 * FLOW: Wizard → Project → GitHub Repo → Vercel Project → Linking → READY
 * RULE: NO task dispatch before bootstrap_status = 'ready'
 *
 * Workstreams:
 *   WS1 — Bootstrap State Machine (DB + types)         (3 tasks)
 *   WS2 — GitHub Repo Auto-Provisioning                (3 tasks)
 *   WS3 — Vercel Project Auto-Provisioning             (3 tasks)
 *   WS4 — Bootstrap Orchestrator                       (3 tasks)
 *   WS5 — Architect Gate (block dispatch until READY)  (3 tasks)
 *   WS6 — Wizard Integration                           (3 tasks)
 *   WS7 — Validation                                   (3 tasks)
 *
 * Total: 1 Epic · 7 Features · 21 Tasks
 */

import type { RoadmapEpic } from './build-os-roadmap'

export const B0_EPIC_TITLE = 'B0 — Bootstrap Engine Rebuild'

export const ROADMAP_B0_SUMMARY = {
  epic_count:    1,
  feature_count: 7,
  task_count:    21,
  workstreams:   ['WS1', 'WS2', 'WS3', 'WS4', 'WS5', 'WS6', 'WS7'],
}

// ─── SCHEMA CONTEXT (injected into all task descriptions) ─────────────────
const SCHEMA_CONTEXT = `
SCHEMA CONTEXT — read before writing any code:

EXISTING TABLES (use these, do NOT invent new ones):
- projects (id uuid, name text, status text, user_id uuid, project_type text, bootstrap_status text)
- project_integrations (id uuid, project_id uuid, provider text, status text, environment_map jsonb, created_at timestamptz)
- provider_connections (id uuid, project_id uuid, provider text, credentials_encrypted jsonb, created_at timestamptz)
- deployment_targets (id uuid, project_id uuid, provider text, external_id text, url text, status text, config jsonb, created_at timestamptz)
- tasks (id uuid, project_id uuid, title text, status text, task_type text, agent_role text, context_payload jsonb, retry_count int, failure_detail text)
- bootstrap_log (id uuid, project_id uuid, step text, status text, detail text, created_at timestamptz) -- created in WS1-T1

EXISTING LIB FILES:
- src/lib/github-provision.ts — provisionGitHubRepo(projectId, projectName, options)
- src/lib/vercel-provision.ts — provisionVercelProject(projectId, projectName, options)
- src/lib/provision-db.ts — saveProvisioningResult(supabase, projectId, result)
- src/lib/supabase/server.ts — createAdminSupabaseClient()
- src/app/api/projects/[id]/provision/route.ts — existing idempotent provision route

FORBIDDEN TABLES (DO NOT USE):
schema_registry, generation_jobs, generation_runs, oauth_connections, project_connections,
agent_runs, migration_runs, bootstrap_events, bootstrap_tasks

LANGUAGE: TypeScript + Next.js 14 App Router only. SQL migrations use .sql files in migrations/.
`.trim()

export const BUILD_OS_ROADMAP_B0: RoadmapEpic[] = [
  {
    title: B0_EPIC_TITLE,
    description:
      'Rebuild the project bootstrap engine so every project has a GitHub repo, ' +
      'Vercel project, and linking record BEFORE any architect or agent tasks run. ' +
      'Introduces bootstrap_status state machine on projects table. ' +
      'Adds orchestrator, architect gate, and wizard integration.',
    order_index: 0,

    features: [

      // ══════════════════════════════════════════════════════════════════
      // WS1 — Bootstrap State Machine
      // ══════════════════════════════════════════════════════════════════
      {
        title: 'WS1 — Bootstrap State Machine',
        description:
          'Add bootstrap_status enum column to projects table and create audit log table. ' +
          'Values: not_started | github_pending | github_ready | vercel_pending | vercel_ready | linking | linked | ready | failed. ' +
          'TypeScript enum + type-safe helpers.',
        priority:    'critical',
        order_index: 0,
        tasks: [
          {
            title: '[B0 WS1-T1] Migration 033 — Add bootstrap_status to projects + create bootstrap_log',
            description: `${SCHEMA_CONTEXT}

TASK: Create Supabase migration file.

FILE: migrations/20260403000033_bootstrap_state_machine.sql

SQL to write:
\`\`\`sql
-- Migration 033: Bootstrap state machine
-- Adds bootstrap_status to projects and creates bootstrap_log audit table

-- 1. Add bootstrap_status column to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS bootstrap_status text NOT NULL DEFAULT 'not_started'
  CHECK (bootstrap_status IN (
    'not_started', 'github_pending', 'github_ready',
    'vercel_pending', 'vercel_ready', 'linking', 'linked',
    'ready', 'failed'
  ));

-- 2. Create bootstrap_log for audit trail
CREATE TABLE IF NOT EXISTS bootstrap_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step          text NOT NULL,     -- 'github' | 'vercel' | 'linking' | 'ready' | 'failed'
  status        text NOT NULL,     -- 'started' | 'completed' | 'failed'
  detail        text,              -- success URL or error message
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bootstrap_log_project_id_idx ON bootstrap_log(project_id);
CREATE INDEX IF NOT EXISTS bootstrap_log_created_at_idx ON bootstrap_log(created_at DESC);

-- 3. RLS: service role only (no direct user access)
ALTER TABLE bootstrap_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON bootstrap_log
  FOR ALL TO service_role USING (true);
\`\`\`

OUTPUT FORMAT:
\`\`\`json
{
  "output": {
    "files": [
      {
        "path": "migrations/20260403000033_bootstrap_state_machine.sql",
        "content": "-- Migration 033: Bootstrap state machine\\n..."
      }
    ]
  }
}
\`\`\``,
            task_type:  'schema',
            agent_role: 'database_engineer',
            priority:   'critical',
            order_index: 0,
          },
          {
            title: '[B0 WS1-T2] Create src/lib/bootstrap-types.ts — BootstrapStatus enum + helpers',
            description: `${SCHEMA_CONTEXT}

TASK: Create TypeScript type definitions for the bootstrap state machine.

FILE: src/lib/bootstrap-types.ts

Content to write:
- BootstrapStatus enum: NOT_STARTED | GITHUB_PENDING | GITHUB_READY | VERCEL_PENDING | VERCEL_READY | LINKING | LINKED | READY | FAILED
- BootstrapStep type: 'github' | 'vercel' | 'linking'
- BootstrapResult interface: { success: boolean; step: BootstrapStep; repoUrl?: string; vercelProjectId?: string; error?: string }
- isBootstrapComplete(status: string): boolean helper — returns true only for 'ready'
- isBootstrapFailed(status: string): boolean helper
- nextBootstrapStatus(current: string, step: BootstrapStep, success: boolean): string — state machine transition

IMPORTANT: No DB calls in this file. Pure types + pure functions only.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/lib/bootstrap-types.ts", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'critical',
            order_index: 1,
          },
          {
            title: '[B0 WS1-T3] Create src/lib/bootstrap-db.ts — DB helpers for bootstrap_status updates',
            description: `${SCHEMA_CONTEXT}

TASK: Create DB helper functions for bootstrap state machine.

FILE: src/lib/bootstrap-db.ts

Functions to implement:
1. updateBootstrapStatus(supabase, projectId: string, status: string): Promise<void>
   - Updates projects.bootstrap_status WHERE id = projectId
   - Non-fatal: console.error on failure but does NOT throw

2. logBootstrapStep(supabase, projectId: string, step: string, status: 'started' | 'completed' | 'failed', detail?: string): Promise<void>
   - Inserts row into bootstrap_log table
   - Non-fatal: console.warn on failure but does NOT throw

3. getBootstrapStatus(supabase, projectId: string): Promise<string>
   - SELECT bootstrap_status FROM projects WHERE id = projectId
   - Returns 'not_started' if project not found

4. isProjectReady(supabase, projectId: string): Promise<boolean>
   - Returns true only if bootstrap_status = 'ready'

Import: createAdminSupabaseClient from '@/lib/supabase/server'
All functions accept a Supabase client as first param (dependency injection pattern).

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/lib/bootstrap-db.ts", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'critical',
            order_index: 2,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════
      // WS2 — GitHub Repo Auto-Provisioning
      // ══════════════════════════════════════════════════════════════════
      {
        title: 'WS2 — GitHub Repo Auto-Provisioning',
        description:
          'Create POST /api/projects/[id]/bootstrap/github route that provisions ' +
          'a GitHub repo using the existing provisionGitHubRepo lib. ' +
          'Stores result in project_integrations. Updates bootstrap_status → github_ready.',
        priority:    'critical',
        order_index: 1,
        tasks: [
          {
            title: '[B0 WS2-T1] Create POST /api/projects/[id]/bootstrap/github route',
            description: `${SCHEMA_CONTEXT}

TASK: Create GitHub bootstrap route.

FILE: src/app/api/projects/[id]/bootstrap/github/route.ts

Route: POST /api/projects/:id/bootstrap/github

Logic:
1. Auth via X-Buildos-Secret header (same pattern as provision/route.ts)
2. Check if project exists (query projects table)
3. Check if github integration already active in project_integrations — if yes, return existing (idempotent)
4. Call updateBootstrapStatus(supabase, projectId, 'github_pending') from src/lib/bootstrap-db.ts
5. Call logBootstrapStep(supabase, projectId, 'github', 'started')
6. Call provisionGitHubRepo(projectId, project.name) from src/lib/github-provision.ts
7. On success:
   - Upsert into project_integrations: { project_id, provider: 'github', status: 'active', environment_map: { github_repo_url, github_repo_name, github_repo_id } }
   - Call updateBootstrapStatus(supabase, projectId, 'github_ready')
   - Call logBootstrapStep(supabase, projectId, 'github', 'completed', repoUrl)
   - Return 200: { success: true, repo_url, bootstrap_status: 'github_ready' }
8. On failure:
   - Call updateBootstrapStatus(supabase, projectId, 'failed')
   - Call logBootstrapStep(supabase, projectId, 'github', 'failed', error.message)
   - Return 500: { success: false, error }

Import bootstrap-db helpers from '@/lib/bootstrap-db'.
Import provisionGitHubRepo from '@/lib/github-provision'.
Use createAdminSupabaseClient from '@/lib/supabase/server'.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/projects/[id]/bootstrap/github/route.ts", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'critical',
            order_index: 0,
          },
          {
            title: '[B0 WS2-T2] Update github-provision.ts — ensure idempotent repo creation with bootstrap_status awareness',
            description: `${SCHEMA_CONTEXT}

TASK: Read src/lib/github-provision.ts and verify it handles the case where a repo already exists (409 from GitHub API = idempotent success, not failure). If it throws on 409/422, add a guard that treats "repository already exists" as a successful provision and returns the existing repo URL.

Also ensure the function returns: { success: boolean; repoUrl?: string; repoName?: string; repoId?: number; error?: string }

If the function already handles this correctly, write a thin wrapper exportable as ensureGitHubRepo(projectId, projectName) that encapsulates the idempotency check.

IMPORTANT: Do not rewrite the entire file. Make surgical additions only.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/lib/github-provision.ts", "content": "...full updated file..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 1,
          },
          {
            title: '[B0 WS2-T3] Add MIGRATE-B0-033.sql to repo root with paste instructions',
            description: `${SCHEMA_CONTEXT}

TASK: Create a standalone SQL file at repo root for the developer to paste into Supabase SQL Editor (pg.Client migrations never work — must use Supabase dashboard).

FILE: MIGRATE-B0-033.sql

Content: copy the exact SQL from migrations/20260403000033_bootstrap_state_machine.sql, then add a header comment:
-- PASTE THIS IN SUPABASE SQL EDITOR: https://supabase.com/dashboard/project/zyvpoyxdxedcugtdrluc/sql/new
-- Migration 033: Bootstrap state machine (bootstrap_status + bootstrap_log)
-- Run ONCE. Idempotent (uses IF NOT EXISTS / IF EXISTS).

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "MIGRATE-B0-033.sql", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 2,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════
      // WS3 — Vercel Project Auto-Provisioning
      // ══════════════════════════════════════════════════════════════════
      {
        title: 'WS3 — Vercel Project Auto-Provisioning',
        description:
          'Create POST /api/projects/[id]/bootstrap/vercel route that provisions ' +
          'a Vercel project using the existing provisionVercelProject lib. ' +
          'Stores result in deployment_targets. Updates bootstrap_status → vercel_ready.',
        priority:    'critical',
        order_index: 2,
        tasks: [
          {
            title: '[B0 WS3-T1] Create POST /api/projects/[id]/bootstrap/vercel route',
            description: `${SCHEMA_CONTEXT}

TASK: Create Vercel bootstrap route.

FILE: src/app/api/projects/[id]/bootstrap/vercel/route.ts

Route: POST /api/projects/:id/bootstrap/vercel

Logic:
1. Auth via X-Buildos-Secret header
2. Check project exists
3. Check if Vercel deployment_target already active — if yes, return existing (idempotent)
4. updateBootstrapStatus(supabase, projectId, 'vercel_pending')
5. logBootstrapStep(supabase, projectId, 'vercel', 'started')
6. Call provisionVercelProject(projectId, project.name) from src/lib/vercel-provision.ts
7. On success:
   - Upsert into deployment_targets: { project_id, provider: 'vercel', external_id: vercelProjectId, url: deploymentUrl, status: 'active', config: { vercel_project_id, vercel_project_name } }
   - updateBootstrapStatus(supabase, projectId, 'vercel_ready')
   - logBootstrapStep(supabase, projectId, 'vercel', 'completed', deploymentUrl)
   - Return 200: { success: true, vercel_project_id, deployment_url, bootstrap_status: 'vercel_ready' }
8. On failure:
   - updateBootstrapStatus(supabase, projectId, 'failed')
   - logBootstrapStep(supabase, projectId, 'vercel', 'failed', error.message)
   - Return 500: { success: false, error }

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/projects/[id]/bootstrap/vercel/route.ts", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'critical',
            order_index: 0,
          },
          {
            title: '[B0 WS3-T2] Update vercel-provision.ts — ensure idempotent Vercel project creation',
            description: `${SCHEMA_CONTEXT}

TASK: Read src/lib/vercel-provision.ts. Ensure provisionVercelProject handles 409 (project name already exists) as an idempotent success — fetch the existing project ID and return it rather than throwing. Add a guard: if Vercel API returns 409 with "A project with this name already exists", look up the existing project by name via GET /v9/projects/:name and return it as a successful provision result.

Also ensure the return type is: { success: boolean; projectId?: string; projectName?: string; deploymentUrl?: string; error?: string }

If this is already handled, write a thin wrapper exportable as ensureVercelProject(projectId, projectName).

IMPORTANT: Surgical additions only. Do not rewrite the whole file.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/lib/vercel-provision.ts", "content": "...full updated file..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 1,
          },
          {
            title: '[B0 WS3-T3] Create GET /api/projects/[id]/bootstrap/status route',
            description: `${SCHEMA_CONTEXT}

TASK: Create a status endpoint to poll bootstrap progress.

FILE: src/app/api/projects/[id]/bootstrap/status/route.ts

Route: GET /api/projects/:id/bootstrap/status

Logic:
1. Auth via X-Buildos-Secret OR user JWT session
2. Query projects.bootstrap_status WHERE id = projectId
3. Query last 5 bootstrap_log rows for this project (ORDER BY created_at DESC)
4. Query project_integrations WHERE project_id = projectId AND status = 'active'
5. Query deployment_targets WHERE project_id = projectId AND status = 'active'

Return:
\`\`\`json
{
  "bootstrap_status": "ready",
  "is_ready": true,
  "integrations": { "github": { "repo_url": "..." }, "vercel": { "url": "..." } },
  "log": [{ "step": "github", "status": "completed", "detail": "...", "created_at": "..." }]
}
\`\`\`

This endpoint is polled by the wizard UI to show progress.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/projects/[id]/bootstrap/status/route.ts", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 2,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════
      // WS4 — Bootstrap Orchestrator
      // ══════════════════════════════════════════════════════════════════
      {
        title: 'WS4 — Bootstrap Orchestrator',
        description:
          'Single entry point POST /api/projects/[id]/bootstrap that runs ' +
          'GitHub → Vercel in sequence, handles failures, and sets final ' +
          'bootstrap_status = ready when both succeed.',
        priority:    'critical',
        order_index: 3,
        tasks: [
          {
            title: '[B0 WS4-T1] Create POST /api/projects/[id]/bootstrap — main orchestrator',
            description: `${SCHEMA_CONTEXT}

TASK: Create the main bootstrap orchestrator route.

FILE: src/app/api/projects/[id]/bootstrap/route.ts

Route: POST /api/projects/:id/bootstrap

This is the SINGLE entry point called by the wizard after project creation.

Logic:
1. Auth via X-Buildos-Secret OR user JWT
2. Check project exists + get project name
3. If bootstrap_status is already 'ready' → return 200 immediately (idempotent)
4. If bootstrap_status is 'failed' → allow retry (reset to 'not_started' before proceeding)

Step A — GitHub:
5. POST /api/projects/{projectId}/bootstrap/github (internal call with X-Buildos-Secret)
6. If fails → set bootstrap_status='failed', return 500 with step='github'

Step B — Vercel:
7. POST /api/projects/{projectId}/bootstrap/vercel (internal call with X-Buildos-Secret)
8. If fails → set bootstrap_status='failed', return 500 with step='vercel'

Step C — Link:
9. Update project_integrations to link GitHub repo URL to the Vercel deployment target
   (update deployment_targets.config with github_repo_url from project_integrations)
10. updateBootstrapStatus(supabase, projectId, 'linked')
11. logBootstrapStep(supabase, projectId, 'linking', 'completed')

Step D — Ready:
12. updateBootstrapStatus(supabase, projectId, 'ready')
13. logBootstrapStep(supabase, projectId, 'ready', 'completed', 'Bootstrap complete')

Return 200: { success: true, bootstrap_status: 'ready', github: { repo_url }, vercel: { url } }

Use createAdminSupabaseClient. Make internal sub-calls via fetch to the sub-routes.
The base URL is process.env.NEXT_PUBLIC_APP_URL || 'https://web-lake-one-88.vercel.app'.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/projects/[id]/bootstrap/route.ts", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'critical',
            order_index: 0,
          },
          {
            title: '[B0 WS4-T2] Update provision/route.ts — call bootstrap on provision if not already ready',
            description: `${SCHEMA_CONTEXT}

TASK: Read src/app/api/projects/[id]/provision/route.ts.

The existing provision route already handles GitHub + Vercel. We need to add bootstrap_status tracking to it so that after a successful provision, bootstrap_status is set to 'ready'.

Add at the end of the successful provision path:
1. Import updateBootstrapStatus and logBootstrapStep from '@/lib/bootstrap-db'
2. After saveProvisioningResult succeeds, call:
   - await updateBootstrapStatus(admin, projectId, 'ready')
   - await logBootstrapStep(admin, projectId, 'ready', 'completed', 'Provisioned via existing route')
3. Both calls must be wrapped in try-catch (non-fatal — provision result is already saved)

This ensures projects provisioned via the old /provision endpoint also get bootstrap_status='ready'.

IMPORTANT: Surgical additions. Do not rewrite the route.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/projects/[id]/provision/route.ts", "content": "...full updated file..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 1,
          },
          {
            title: '[B0 WS4-T3] Backfill bootstrap_status for already-provisioned projects',
            description: `${SCHEMA_CONTEXT}

TASK: Create a one-time backfill migration/script.

FILE: migrations/20260403000034_bootstrap_status_backfill.sql

SQL logic:
1. Set bootstrap_status = 'ready' for all projects that have BOTH:
   - An active row in project_integrations WHERE provider = 'github'
   - An active row in deployment_targets WHERE provider = 'vercel'

2. Set bootstrap_status = 'github_ready' for projects that have:
   - An active row in project_integrations WHERE provider = 'github'
   - But NO active deployment_targets row

3. All other projects with status 'in_progress' that have neither → leave as 'not_started'

SQL:
\`\`\`sql
-- Migration 034: Backfill bootstrap_status for existing projects

-- Projects with both GitHub and Vercel → ready
UPDATE projects SET bootstrap_status = 'ready'
WHERE id IN (
  SELECT pi.project_id FROM project_integrations pi
  INNER JOIN deployment_targets dt ON dt.project_id = pi.project_id
  WHERE pi.provider = 'github' AND pi.status = 'active'
    AND dt.provider = 'vercel' AND dt.status = 'active'
) AND bootstrap_status = 'not_started';

-- Projects with GitHub only → github_ready
UPDATE projects SET bootstrap_status = 'github_ready'
WHERE id IN (
  SELECT pi.project_id FROM project_integrations pi
  WHERE pi.provider = 'github' AND pi.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM deployment_targets dt
    WHERE dt.project_id = pi.project_id AND dt.provider = 'vercel'
  )
) AND bootstrap_status = 'not_started';
\`\`\`

Also add MIGRATE-B0-034.sql to repo root with same header comment as WS2-T3.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [
  {"path": "migrations/20260403000034_bootstrap_status_backfill.sql", "content": "..."},
  {"path": "MIGRATE-B0-034.sql", "content": "..."}
]}}
\`\`\``,
            task_type:  'schema',
            agent_role: 'database_engineer',
            priority:   'high',
            order_index: 2,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════
      // WS5 — Architect Gate
      // ══════════════════════════════════════════════════════════════════
      {
        title: 'WS5 — Architect Gate (block dispatch until READY)',
        description:
          'Prevent task dispatch for projects where bootstrap_status != ready. ' +
          'Gate is enforced in the orchestrate/tick endpoint. ' +
          'Blocked tasks get a clear failure_detail pointing to bootstrap.',
        priority:    'critical',
        order_index: 4,
        tasks: [
          {
            title: '[B0 WS5-T1] Update orchestrate/tick — gate dispatch on bootstrap_status = ready',
            description: `${SCHEMA_CONTEXT}

TASK: Read src/app/api/orchestrate/tick/route.ts (or equivalent dispatch path).

Find where tasks are selected for dispatch (the query that picks 'ready' tasks).

Add a bootstrap gate:
1. Import isProjectReady from '@/lib/bootstrap-db' (or inline the check)
2. Before dispatching any task batch for a project, check: bootstrap_status = 'ready' via:
   SELECT bootstrap_status FROM projects WHERE id = project_id
3. If bootstrap_status != 'ready':
   - DO NOT dispatch any tasks for this project
   - Log: console.warn('[orchestrate/tick] Project {projectId} bootstrap not ready — dispatch blocked. bootstrap_status={status}')
   - DO NOT set tasks to blocked — just skip them silently (they'll be dispatched once bootstrap completes)
   - Return a clear message in the tick response: { blocked_projects: [{ project_id, bootstrap_status }] }

This is the PRIMARY enforcement gate. No tasks run until bootstrap = ready.

IMPORTANT: This change must be non-breaking for projects already at bootstrap_status='ready' or 'not_started' for legacy projects (treat 'not_started' as unblocked for backward compat during migration window — only block 'github_pending', 'vercel_pending', 'linking', 'failed').

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/orchestrate/tick/route.ts", "content": "...full updated file..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'critical',
            order_index: 0,
          },
          {
            title: '[B0 WS5-T2] Add bootstrap_status to GET /api/pipeline/health response',
            description: `${SCHEMA_CONTEXT}

TASK: Read src/app/api/pipeline/health/route.ts.

Add to the health response:
1. Query: SELECT id, name, bootstrap_status FROM projects WHERE id = (the project being checked)
2. Add to response: { bootstrap_status: "ready" | "not_started" | ..., bootstrap_ready: true/false }
3. If bootstrap_status != 'ready' AND there are ready tasks blocked, add: { bootstrap_gate_active: true, message: "Tasks blocked: project bootstrap not complete" }

This gives Supervisor AI visibility into bootstrap state from the health endpoint.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/pipeline/health/route.ts", "content": "...full updated file..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 1,
          },
          {
            title: '[B0 WS5-T3] Create GET /api/admin/bootstrap-check — audit all projects bootstrap state',
            description: `${SCHEMA_CONTEXT}

TASK: Create an admin endpoint to check bootstrap state across all projects.

FILE: src/app/api/admin/bootstrap-check/route.ts

Route: GET /api/admin/bootstrap-check
Auth: X-Buildos-Secret header

Query:
\`\`\`sql
SELECT
  p.id, p.name, p.status, p.bootstrap_status,
  COUNT(t.id) FILTER (WHERE t.status = 'ready') AS ready_tasks_blocked,
  MAX(bl.created_at) AS last_bootstrap_event
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
LEFT JOIN bootstrap_log bl ON bl.project_id = p.id
GROUP BY p.id, p.name, p.status, p.bootstrap_status
ORDER BY p.created_at DESC
\`\`\`

Return: { data: [{ id, name, status, bootstrap_status, ready_tasks_blocked, last_bootstrap_event }] }

This is the Supervisor's audit tool for bootstrap state.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/admin/bootstrap-check/route.ts", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 2,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════
      // WS6 — Wizard Integration
      // ══════════════════════════════════════════════════════════════════
      {
        title: 'WS6 — Wizard Integration',
        description:
          'Update the project creation wizard to call POST /api/projects/[id]/bootstrap ' +
          'after project creation and show a live bootstrap progress UI before enabling ' +
          'the "Start Building" button.',
        priority:    'high',
        order_index: 5,
        tasks: [
          {
            title: '[B0 WS6-T1] Update project creation flow — call bootstrap after project insert',
            description: `${SCHEMA_CONTEXT}

TASK: Find the project creation API route (likely src/app/api/projects/route.ts or the wizard submit handler).

After a project is successfully created (INSERT into projects table returns new project ID):
1. Fire a non-blocking call to POST /api/projects/{newProjectId}/bootstrap using the internal secret
2. Use waitUntil() if inside a Vercel function, or fire-and-forget fetch if synchronous code path
3. Do NOT await — bootstrap happens in background, wizard shows progress via polling

The wizard should NOT wait for bootstrap to complete before returning the project ID to the client.

IMPORTANT: The existing project creation should remain unchanged — only ADD the bootstrap trigger after successful project insert.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/app/api/projects/route.ts", "content": "...full updated file..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'backend_engineer',
            priority:   'high',
            order_index: 0,
          },
          {
            title: '[B0 WS6-T2] Create BootstrapProgress React component',
            description: `${SCHEMA_CONTEXT}

TASK: Create a React component that polls bootstrap status and shows progress.

FILE: src/components/bootstrap-progress.tsx

Props:
- projectId: string
- onReady: () => void — called when bootstrap_status = 'ready'
- onFailed: (error: string) => void

Behaviour:
1. Poll GET /api/projects/{projectId}/bootstrap/status every 2 seconds
2. Show a step-by-step progress indicator:
   - Step 1: Creating GitHub repository... ✓ / spinner / ✗
   - Step 2: Creating Vercel project... ✓ / spinner / ✗
   - Step 3: Linking... ✓ / spinner / ✗
   - Step 4: Ready! ✓
3. On bootstrap_status = 'ready': call onReady(), stop polling
4. On bootstrap_status = 'failed': show error from last bootstrap_log entry, call onFailed()
5. If already 'ready' on first poll: call onReady() immediately

Use Tailwind utility classes only. No external UI libraries.
Use React hooks: useState, useEffect.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/components/bootstrap-progress.tsx", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'frontend_engineer',
            priority:   'high',
            order_index: 1,
          },
          {
            title: '[B0 WS6-T3] Update Smart Wizard final step — show BootstrapProgress before enabling Start Building',
            description: `${SCHEMA_CONTEXT}

TASK: Find the Smart Wizard final confirmation step component (likely in src/components/wizard/ or src/app/(dashboard)/wizard/).

After project creation confirmation:
1. Import BootstrapProgress from '@/components/bootstrap-progress'
2. Replace the static "Project created! Start Building →" button with:
   - Render <BootstrapProgress projectId={newProjectId} onReady={handleReady} onFailed={handleFailed} />
   - "Start Building" button is DISABLED until onReady fires
   - Once onReady fires: enable the button, show "✓ Repository ready. Start Building →"
3. If bootstrap fails: show "Bootstrap failed — Retry" button that calls POST /api/projects/{id}/bootstrap again

This enforces the NO TASKS BEFORE READY rule at the UX level.

Find the wizard file by searching for "confirmation" or "start building" or the final step in the wizard flow.

OUTPUT FORMAT:
\`\`\`json
{"output": {"files": [{"path": "src/components/wizard/...", "content": "..."}]}}
\`\`\``,
            task_type:  'code',
            agent_role: 'frontend_engineer',
            priority:   'high',
            order_index: 2,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════
      // WS7 — Validation
      // ══════════════════════════════════════════════════════════════════
      {
        title: 'WS7 — Validation',
        description:
          'Verify the full bootstrap flow end-to-end. ' +
          'Confirm migration exists, routes deploy, gate blocks dispatch, ' +
          'and status endpoint returns correct state.',
        priority:    'high',
        order_index: 6,
        tasks: [
          {
            title: '[B0 WS7-T1] Verify: migration files exist and are syntactically valid',
            description: `${SCHEMA_CONTEXT}

TASK: Review task — no code changes.

Check that the following files exist in the repo:
1. migrations/20260403000033_bootstrap_state_machine.sql — ALTER TABLE projects ADD COLUMN bootstrap_status + CREATE TABLE bootstrap_log
2. migrations/20260403000034_bootstrap_status_backfill.sql — UPDATE projects SET bootstrap_status
3. MIGRATE-B0-033.sql — paste instructions at top
4. MIGRATE-B0-034.sql — paste instructions at top

For each file: confirm it exists, confirm it contains the expected SQL keywords (ALTER TABLE, CREATE TABLE / UPDATE projects), confirm it has the Supabase SQL Editor paste comment.

Report: list each file with status FOUND/MISSING and the first SQL statement.

OUTPUT FORMAT: Return a document task output with the verification report.`,
            task_type:  'review',
            agent_role: 'qa_security_auditor',
            priority:   'high',
            order_index: 0,
          },
          {
            title: '[B0 WS7-T2] Verify: bootstrap routes are deployed and return 401 without auth',
            description: `${SCHEMA_CONTEXT}

TASK: Review/test task.

Call the following endpoints WITHOUT the X-Buildos-Secret header and confirm each returns HTTP 401 (not 404 which means the route doesn't exist):

1. POST https://web-lake-one-88.vercel.app/api/projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c/bootstrap
2. POST https://web-lake-one-88.vercel.app/api/projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c/bootstrap/github
3. POST https://web-lake-one-88.vercel.app/api/projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c/bootstrap/vercel
4. GET https://web-lake-one-88.vercel.app/api/projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c/bootstrap/status
5. GET https://web-lake-one-88.vercel.app/api/admin/bootstrap-check

For each: report HTTP status code. 401 = route exists. 404 = route NOT deployed.

Report all 5 results. PASS = all return 401. FAIL = any return 404.

OUTPUT FORMAT: Return a document task output with the verification report.`,
            task_type:  'review',
            agent_role: 'qa_security_auditor',
            priority:   'high',
            order_index: 1,
          },
          {
            title: '[B0 WS7-T3] Verify: bootstrap_status column exists in projects table',
            description: `${SCHEMA_CONTEXT}

TASK: Review/test task — DB verification.

Call GET https://web-lake-one-88.vercel.app/api/admin/bootstrap-check
with header X-Buildos-Secret: fbdc1467fcb75e068ef3f0976bf132934cba8a75e3adb24d2cd580a437eb532b

Expected: response contains an array of projects with bootstrap_status field populated.

If the endpoint returns 500 or the bootstrap_status field is missing from the response, the migration has not been applied.

Also call GET https://web-lake-one-88.vercel.app/api/pipeline/health with the same header.
Confirm the response now includes a bootstrap_status field.

Report both call results. PASS if bootstrap_status is visible in both responses.

OUTPUT FORMAT: Return a document task output with the verification report including raw API responses.`,
            task_type:  'review',
            agent_role: 'qa_security_auditor',
            priority:   'high',
            order_index: 2,
          },
        ],
      },

    ],
  },
]
