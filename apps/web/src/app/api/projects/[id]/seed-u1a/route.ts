/**
 * POST /api/projects/[id]/seed-u1a
 *
 * Seeds U1-A — Users / Roles / Permissions Foundation
 *
 * Epic:        U1-A RBAC Foundation
 * Workstreams: WS1–WS6  (6 workstreams)
 * Tasks:       18 developer tasks
 * Mode:        FOUNDATION BUILD — DEVELOPER-FIRST
 *
 * Claude Cowork — Architect seed only. Developers execute.
 *
 * Spec source: U1A_RBAC_Foundation.txt (Founder / Product Owner)
 * Migrations:  031_rbac_membership_tables.sql
 *              032_rbac_rls_overhaul.sql
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase   = await createServerSupabaseClient()
  const admin      = createAdminSupabaseClient()
  const projectId  = params.id

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Create Epic ──────────────────────────────────────────────────────────

  const { data: epic, error: epicErr } = await admin
    .from('epics')
    .insert({
      project_id:  projectId,
      title:       'U1-A — Users / Roles / Permissions Foundation (RBAC Core)',
      description: `FOUNDATION BUILD. Transition Build OS from single-tenant org-scoped access control to a
production-grade multi-tenant RBAC system. Creates three membership tables
(organization_members, workspace_members, project_members), replaces all
org-scoped RLS helper functions with membership-aware equivalents, overwrites
all core RLS policies, adds membership management API routes, and updates
provisioning to auto-create memberships on object creation.

Target model (LOCKED):
  User → Organization (owner/admin/member/viewer)
       → Workspace    (admin/editor/viewer)
       → Project      (admin/editor/viewer)

Acceptance: RBAC works + RLS works + no data leakage + multi-user safe.`,
      status:      'in_progress',
      priority:    'critical',
      slug:        'u1a-rbac-foundation',
      order_index: 0,
    })
    .select('id')
    .single()

  if (epicErr) return NextResponse.json({ error: epicErr.message, step: 'epic' }, { status: 500 })
  const epicId = epic.id

  // ── 2. Define Workstreams + Tasks ───────────────────────────────────────────

  const workstreams: Array<{
    slug: string
    order_index: number
    title: string
    description: string
    tasks: Array<{
      title: string
      description: string
      priority: string
      order_index: number
      estimated_hours?: number
    }>
  }> = [
    // ── WS1 — DB: Membership Tables ──────────────────────────────────────────
    {
      slug: 'ws1-membership-tables', order_index: 1,
      title: 'WS1 — Database: Membership Tables',
      description: 'Create the three membership junction tables. These are the backbone of the new RBAC system. No UI work in this workstream — pure schema.',
      tasks: [
        {
          title: 'Apply migration 031: create organization_members, workspace_members, project_members tables',
          description: `Apply migrations/20260401000031_rbac_membership_tables.sql in Supabase SQL Editor.

Tables to create:
  • organization_members (id, organization_id FK, user_id FK, role, status, invited_by FK, created_at, updated_at)
    role CHECK: owner | admin | member | viewer
    status CHECK: active | invited | suspended
    UNIQUE (organization_id, user_id)

  • workspace_members (id, workspace_id FK, user_id FK, role, status, created_at, updated_at)
    role CHECK: admin | editor | viewer
    UNIQUE (workspace_id, user_id)

  • project_members (id, project_id FK, user_id FK, role, created_at, updated_at)
    role CHECK: admin | editor | viewer
    UNIQUE (project_id, user_id)

All tables: RLS ENABLED (no policies yet — added in WS3).
All tables: updated_at trigger via buildos_set_updated_at().
All tables: indexes on (org/ws/proj)_id and user_id.

VERIFY after:
  SELECT table_name FROM information_schema.tables WHERE table_name IN ('organization_members','workspace_members','project_members');
  → must return 3 rows`,
          priority: 'critical', order_index: 1, estimated_hours: 1,
        },
        {
          title: 'Run seed: migrate existing users into all three membership tables',
          description: `The seed SQL is included at the bottom of migration 031. Run it explicitly after the table creation to populate membership rows from existing data.

Logic:
  organization_members ← from users table (users.role maps to org role)
  workspace_members    ← every user becomes admin of every workspace in their org
  project_members      ← every user becomes admin of every project in their org

Why admin for existing data: users previously had unrestricted access; granting admin preserves that access through the new system. Downgrade roles manually after multi-user testing.

VERIFY:
  SELECT count(*) FROM organization_members;  -- should equal count(users)
  SELECT count(*) FROM workspace_members;     -- should equal count(users) × count(workspaces)
  SELECT count(*) FROM project_members;       -- should equal count(users) × count(projects)`,
          priority: 'critical', order_index: 2, estimated_hours: 0.5,
        },
        {
          title: 'Verify migration 031: row counts, constraints, index existence',
          description: `Run all verification queries and confirm correct counts.

Checklist:
  ☐ organization_members: row count matches users table
  ☐ workspace_members: row count matches users × workspaces
  ☐ project_members: row count matches users × projects
  ☐ Unique constraint enforced: attempt duplicate INSERT → must fail with 23505
  ☐ FK enforced: attempt INSERT with non-existent user_id → must fail with 23503
  ☐ Role CHECK enforced: attempt INSERT with role='superuser' → must fail with 23514
  ☐ RLS is ENABLED on all three tables (verify in Supabase table editor)
  ☐ Indexes visible in pg_indexes

Document result as comment in this task.`,
          priority: 'critical', order_index: 3, estimated_hours: 0.5,
        },
      ],
    },

    // ── WS2 — RLS: Helper Function Overhaul ──────────────────────────────────
    {
      slug: 'ws2-rls-helper-functions', order_index: 2,
      title: 'WS2 — RLS: Helper Function Overhaul',
      description: 'Replace all org-scoped RLS helper functions with membership-aware equivalents. These functions are the foundation every RLS policy depends on. Must be applied BEFORE the policy overhaul in WS3.',
      tasks: [
        {
          title: 'Replace buildos_current_workspace_ids() with membership-aware version',
          description: `Current implementation returns ALL workspaces in the org — no membership check.

New implementation (from migration 032):
  Returns workspace IDs where:
    (a) user has active workspace_members row, OR
    (b) user is org owner/admin (inherited access)

This is a breaking change to the existing function signature. Apply via Supabase SQL Editor.
Test: SELECT * FROM buildos_current_workspace_ids() — must return only workspaces where current user is a member.`,
          priority: 'critical', order_index: 1, estimated_hours: 0.5,
        },
        {
          title: 'Replace buildos_current_project_ids() with membership-aware version',
          description: `Current implementation returns ALL projects in the org — no membership check.

New implementation:
  Returns project IDs where:
    (a) user has a project_members row, OR
    (b) user is workspace admin, OR
    (c) user is org owner/admin

Apply via Supabase SQL Editor (migration 032).
Test: SELECT * FROM buildos_current_project_ids() — must return only accessible projects.`,
          priority: 'critical', order_index: 2, estimated_hours: 0.5,
        },
        {
          title: 'Create new role accessor functions: buildos_get_org_role, buildos_get_ws_role, buildos_get_proj_role',
          description: `Create three new SECURITY DEFINER functions:

  buildos_get_org_role(p_org_id uuid)  RETURNS text
    → SELECT role FROM organization_members WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'

  buildos_get_ws_role(p_ws_id uuid)  RETURNS text
    → SELECT role FROM workspace_members WHERE workspace_id = p_ws_id AND user_id = auth.uid() AND status = 'active'

  buildos_get_proj_role(p_proj_id uuid)  RETURNS text
    → SELECT role FROM project_members WHERE project_id = p_proj_id AND user_id = auth.uid()

All return NULL if no membership row exists.
All are STABLE + SECURITY DEFINER (executes as postgres, not caller).

Test each: SELECT buildos_get_org_role('<your-org-id>') — must return 'owner'.`,
          priority: 'critical', order_index: 3, estimated_hours: 0.5,
        },
        {
          title: 'Update buildos_current_user_role() to read from organization_members',
          description: `Current: reads from users.role (single global role, deprecated).
New: reads from organization_members.role for the calling user's primary org.

New implementation:
  SELECT role FROM organization_members
  WHERE user_id = auth.uid() AND status = 'active'
  ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END
  LIMIT 1

This preserves backwards-compat for any policy that still calls buildos_current_user_role() without a context parameter.

Test: SELECT buildos_current_user_role() — must return 'owner' for the current user.`,
          priority: 'high', order_index: 4, estimated_hours: 0.25,
        },
      ],
    },

    // ── WS3 — RLS: Policy Overhaul ───────────────────────────────────────────
    {
      slug: 'ws3-rls-policy-overhaul', order_index: 3,
      title: 'WS3 — RLS: Policy Overhaul',
      description: 'Drop all existing org-scoped policies on core tables and recreate them using the new membership-aware helper functions. Also add RLS policies to the three new membership tables. APPLY IN A SINGLE TRANSACTION.',
      tasks: [
        {
          title: 'Apply migration 032: drop + recreate RLS policies on organizations, users, workspaces, projects',
          description: `Apply migrations/20260401000032_rbac_rls_overhaul.sql — the DROP + CREATE section.

The migration is wrapped in BEGIN/COMMIT. Apply as a single execution.

Policies that change:
  organizations: now checks organization_members membership (not users.organization_id)
  users: now sees users in shared orgs (not just own org)
  workspaces: now requires workspace_members row OR org owner/admin
  projects: now requires project_members row OR workspace admin OR org owner/admin
  project_environments: inherits via project membership
  project_settings: inherits via project membership

CRITICAL: Apply WS2 (function overhaul) BEFORE this task. Functions must exist before policies reference them.

Verify after:
  SELECT count(*) FROM organizations;  -- as current user: must return 1
  SELECT count(*) FROM workspaces;     -- as current user: must return 3 (Workspace1/2/3)
  SELECT count(*) FROM projects;       -- as current user: must return 3`,
          priority: 'critical', order_index: 1, estimated_hours: 1,
        },
        {
          title: 'Apply RLS policies to organization_members, workspace_members, project_members',
          description: `Apply the membership table policy section from migration 032.

Policies for organization_members:
  SELECT: user sees all members of their orgs
  INSERT/UPDATE/DELETE: only org owner/admin (cannot remove yourself)

Policies for workspace_members:
  SELECT: user sees members of workspaces they can access
  INSERT/UPDATE/DELETE: only workspace admin or org owner/admin (cannot remove yourself)

Policies for project_members:
  SELECT: user sees members of projects they can access
  INSERT/UPDATE/DELETE: only project admin, workspace admin, or org owner/admin (cannot remove yourself)

Test: As current user, SELECT * FROM organization_members → must see your own row only (1 org currently).`,
          priority: 'critical', order_index: 2, estimated_hours: 0.5,
        },
        {
          title: 'Verify RLS isolation: new user with no memberships sees nothing',
          description: `Create a second Supabase auth user (use Supabase dashboard → Authentication → Add user).
Do NOT add them to any membership tables.

Test with their JWT:
  SELECT count(*) FROM organizations;         -- must return 0
  SELECT count(*) FROM workspaces;            -- must return 0
  SELECT count(*) FROM projects;              -- must return 0
  SELECT count(*) FROM organization_members;  -- must return 0
  SELECT count(*) FROM workspace_members;     -- must return 0
  SELECT count(*) FROM project_members;       -- must return 0

If any query returns > 0: RLS is broken. Block further tasks. Report immediately.

Document test results as comment in this task.`,
          priority: 'critical', order_index: 3, estimated_hours: 1,
        },
      ],
    },

    // ── WS4 — Provisioning: Auto-Membership ──────────────────────────────────
    {
      slug: 'ws4-provisioning-auto-membership', order_index: 4,
      title: 'WS4 — Provisioning: Auto-Membership on Creation',
      description: 'When a workspace or project is created, the creator must automatically get an admin membership row. Without this, the creator loses access immediately after creation (RLS would block them).',
      tasks: [
        {
          title: 'Update POST /api/workspaces to auto-create workspace_members row for creator',
          description: `File: apps/web/src/app/api/workspaces/route.ts

After the workspace INSERT succeeds, immediately INSERT into workspace_members:
  INSERT INTO workspace_members (workspace_id, user_id, role, status)
  VALUES (newWorkspace.id, user.id, 'admin', 'active')

This must be atomic with the workspace creation (use a transaction or at minimum verify the insert succeeds before returning 201).

If workspace_members INSERT fails: return 500 and do not return the workspace (rollback if in transaction).

Test: Create a new workspace via the UI or API → verify workspace_members row exists in Supabase.`,
          priority: 'critical', order_index: 1, estimated_hours: 1,
        },
        {
          title: 'Update project provisioning to auto-create project_members row for creator',
          description: `File: apps/web/src/app/api/projects/[id]/provision/route.ts
(or wherever projects are created — check apps/web/src/app/api/projects/route.ts POST handler)

After project INSERT succeeds:
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (newProject.id, user.id, 'admin')

Also: if a workspace_members row for (workspace_id, user_id) does not exist, create it as 'editor' — project creator must also be a workspace member.

Test: Create a project → verify project_members row exists in Supabase table.`,
          priority: 'critical', order_index: 2, estimated_hours: 1,
        },
      ],
    },

    // ── WS5 — API: Membership Management Routes ───────────────────────────────
    {
      slug: 'ws5-membership-api-routes', order_index: 5,
      title: 'WS5 — API: Membership Management Routes',
      description: 'New API routes for listing and managing members at each level. These are required for the Settings UI (future sprint) and for manual membership management during this validation phase.',
      tasks: [
        {
          title: 'Create GET/POST /api/organizations/[id]/members',
          description: `Create file: apps/web/src/app/api/organizations/[id]/members/route.ts

GET: List all active members of the organization.
  Auth: user must be org member (any role).
  Response: [{ user_id, email, full_name, role, status, created_at }]

POST: Add a member or change a member's role.
  Auth: user must be org owner or admin.
  Body: { user_id: string, role: 'admin' | 'member' | 'viewer' }
  Logic: UPSERT into organization_members. Cannot set role = 'owner' via this endpoint.
  Response: the created/updated membership row.

Error cases:
  403 if caller lacks permission
  400 if role = 'owner' (only one owner allowed, set directly in DB)
  404 if organization not found or caller is not a member`,
          priority: 'high', order_index: 1, estimated_hours: 2,
        },
        {
          title: 'Create GET/POST /api/workspaces/[id]/members',
          description: `Create file: apps/web/src/app/api/workspaces/[id]/members/route.ts

GET: List all active members of the workspace.
  Auth: user must have workspace access (direct or inherited).
  Response: [{ user_id, email, full_name, role, status, created_at }]
  Join with users table to get email + full_name.

POST: Add or update a workspace member.
  Auth: workspace admin or org owner/admin.
  Body: { user_id: string, role: 'admin' | 'editor' | 'viewer' }
  Logic: UPSERT into workspace_members.
  Validation: user_id must belong to the same organization.

DELETE handler: remove a workspace member (admin only, cannot remove self).`,
          priority: 'high', order_index: 2, estimated_hours: 2,
        },
        {
          title: 'Create GET/POST/DELETE /api/projects/[id]/members',
          description: `Create file: apps/web/src/app/api/projects/[id]/members/route.ts

GET: List all project members.
  Auth: any project member (direct or inherited).
  Join with users for display data.

POST: Add or update a project member.
  Auth: project admin, workspace admin, or org owner/admin.
  Body: { user_id: string, role: 'admin' | 'editor' | 'viewer' }
  Validation: user_id must be a workspace member of the project's workspace (workspace access required before project access).

DELETE: Remove a project member.
  Auth: project admin or org admin.
  Cannot remove yourself if you are the last admin.`,
          priority: 'high', order_index: 3, estimated_hours: 2,
        },
      ],
    },

    // ── WS6 — Validation + Acceptance ────────────────────────────────────────
    {
      slug: 'ws6-validation-acceptance', order_index: 6,
      title: 'WS6 — Validation & Acceptance Testing',
      description: 'Multi-user isolation tests, role behavior enforcement tests, and RLS leak verification. ALL tests must pass before U1-A is marked DONE. Claude validates and produces final classification (A/B/C).',
      tasks: [
        {
          title: 'Multi-user isolation test: User B cannot see User A data',
          description: `Scenario: Two users in DIFFERENT organizations.

Setup:
  User A: ajdin@monetizead.com (existing — org: SaaS 4 SaaS, role: owner)
  User B: create new Supabase auth user (no memberships, different org or no org)

Tests to run as User B (use Supabase SQL Editor with User B's JWT or create a test via the app):
  SELECT count(*) FROM organizations;         -- must be 0
  SELECT count(*) FROM workspaces;            -- must be 0
  SELECT count(*) FROM projects;              -- must be 0
  SELECT count(*) FROM epics;                 -- must be 0
  SELECT count(*) FROM tasks;                 -- must be 0
  SELECT count(*) FROM organization_members;  -- must be 0

Report: list each query + result. If any result > 0 = FAIL. Block U1-A acceptance.`,
          priority: 'critical', order_index: 1, estimated_hours: 1,
        },
        {
          title: 'Role behavior test: viewer cannot perform admin actions',
          description: `Scenario: User A (owner) grants User B viewer role on Workspace1.

Setup:
  POST /api/workspaces/[ws1_id]/members  { user_id: userB_id, role: 'viewer' }

Tests as User B:
  ✓ GET /api/workspaces → must see Workspace1 (viewer can read)
  ✓ GET /api/projects   → must see Workspace1 projects (viewer can read)
  ✗ POST /api/workspaces (create new) → must return 403
  ✗ PATCH project        → must return 403
  ✗ POST /api/workspaces/[id]/members → must return 403

Also test editor role:
  ✓ Can view + execute tasks
  ✗ Cannot manage members
  ✗ Cannot delete/archive project

Document pass/fail per scenario.`,
          priority: 'critical', order_index: 2, estimated_hours: 2,
        },
        {
          title: 'RLS leak test: direct DB query confirms no cross-org data visible',
          description: `Use Supabase Table Editor (which uses the authenticated user's JWT, not service_role) to verify:

As User A (owner):
  Browse organization_members → see only your org's members
  Browse workspace_members    → see only your workspaces' members
  Browse project_members      → see only your projects' members
  Try to SELECT from a table where you've confirmed User B has data → must return 0 rows

As User B (viewer on Workspace1 only):
  Browse organizations → see only 1 org (or 0 if cross-org)
  Browse workspaces    → see only Workspace1 (not Workspace2/3)
  Browse projects      → see only projects in Workspace1

If any user can see data outside their memberships: CRITICAL — report immediately, halt sprint.

Final sign-off required from Claude Cowork before U1-A is classified DONE.`,
          priority: 'critical', order_index: 3, estimated_hours: 1,
        },
      ],
    },
  ]

  // ── 3. Insert features (workstreams) + tasks ───────────────────────────────

  let totalTasks = 0
  const errors: string[] = []

  for (const ws of workstreams) {
    const { data: feature, error: featErr } = await admin
      .from('features')
      .insert({
        project_id:  projectId,
        epic_id:     epicId,
        title:       ws.title,
        description: ws.description,
        status:      'in_progress',
        priority:    'critical',
        slug:        ws.slug,
        order_index: ws.order_index,
      })
      .select('id')
      .single()

    if (featErr) {
      errors.push(`Feature ${ws.slug}: ${featErr.message}`)
      continue
    }

    const taskRows = ws.tasks.map(t => ({
      project_id:      projectId,
      epic_id:         epicId,
      feature_id:      feature.id,
      title:           t.title,
      description:     t.description,
      status:          'pending',
      priority:        t.priority,
      task_type:       'implementation',
      order_index:     t.order_index,
      estimated_hours: t.estimated_hours ?? null,
      metadata:        { workstream: ws.slug, epic: 'u1a-rbac-foundation' },
    }))

    const { error: taskErr } = await admin.from('tasks').insert(taskRows)
    if (taskErr) {
      errors.push(`Tasks for ${ws.slug}: ${taskErr.message}`)
    } else {
      totalTasks += taskRows.length
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    epic_id:      epicId,
    workstreams:  workstreams.length,
    tasks_seeded: totalTasks,
    errors:       errors.length > 0 ? errors : undefined,
    message: errors.length === 0
      ? `U1-A seeded: ${workstreams.length} workstreams, ${totalTasks} tasks. Developers execute. Claude monitors.`
      : `U1-A partially seeded with ${errors.length} error(s).`,
  }, { status: errors.length === 0 ? 201 : 207 })
}
