/**
 * POST /api/projects/[id]/seed-u1a1
 * Seeds U1-A.1 — Multi-User RBAC Reality Test
 * Epic: U1-A.1 — Multi-User RBAC Reality Test
 * Workstreams: WS1–WS7 (7 validation workstreams)
 * Tasks: 36 developer + QA tasks
 *
 * Claude Cowork — Architect seed. Developers + Claude QA execute.
 * Claude performs: user creation, DB verification, API proof, browser proof.
 * Developers perform: code fixes if role-gating gaps found, UI role differentiation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient()
  const admin    = createAdminSupabaseClient()
  const projectId = params.id

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Create Epic ────────────────────────────────────────────────────────

  const { data: epic, error: epicErr } = await admin
    .from('epics')
    .insert({
      project_id:  projectId,
      title:       'U1-A.1 — Multi-User RBAC Reality Test',
      description: 'Prove that the new RBAC model works with REAL multiple users. Validate: org/workspace/project roles, cross-user isolation, cross-org isolation, role-based UI behavior, and auto-membership gaps. Migration 031 (membership tables) and 032 (RLS overhaul) are deployed. This phase validates them against real users. 7 workstreams: test user creation, membership setup, access isolation, cross-org isolation, role-based UI, RLS edge cases, auto-membership gap.',
      status:      'in_progress',
      priority:    'critical',
      slug:        'u1-a1-multi-user-rbac-reality-test',
      order_index: 200,
    })
    .select('id')
    .single()

  if (epicErr) return NextResponse.json({ error: epicErr.message }, { status: 500 })
  const epicId = epic.id

  // ── 2. Define Workstreams ─────────────────────────────────────────────────

  const workstreams = [
    {
      slug: 'ws1-test-user-creation', order_index: 1,
      title: 'WS1 — Test User Creation',
      description: 'Create 4 real test users in Supabase Auth with distinct emails, valid auth records, and usable login paths. User A (owner), User B (member/viewer), User C (separate org), User D (fresh — auto-membership gap test). Claude verifies users exist in auth.users and public.users after creation.',
    },
    {
      slug: 'ws2-membership-setup', order_index: 2,
      title: 'WS2 — Membership Setup',
      description: 'Configure roles exactly: User A = org owner + ws admin + project admin. User B = org member + ws viewer + project viewer. User C = owner of a separate org with separate workspace/project. User D = no memberships (gap test). Claude verifies rows exist in organization_members, workspace_members, project_members with correct roles.',
    },
    {
      slug: 'ws3-access-isolation', order_index: 3,
      title: 'WS3 — Access Isolation Test',
      description: 'Prove User B can see what they are allowed to see but cannot edit beyond their viewer permission. Prove User A has full owner access. Validate through DB (RLS queries), API (endpoint responses), and browser (UI state). All three must match.',
    },
    {
      slug: 'ws4-cross-org-isolation', order_index: 4,
      title: 'WS4 — Cross-Org Isolation Test',
      description: 'Prove User A cannot see User C org/workspaces/projects and vice versa. Zero leakage in DB, API, and UI. This is the critical security boundary test. Must be validated through all three proof channels.',
    },
    {
      slug: 'ws5-role-based-ui', order_index: 5,
      title: 'WS5 — Role-Based UI Test',
      description: 'Test visible UI for User A (owner) vs User B (viewer). Verify role differences are reflected in: dashboard, tasks, Smart Wizard, controls/buttons, project actions. Viewer should not access admin/editor-only actions if restricted at the UI layer.',
    },
    {
      slug: 'ws6-rls-edge-cases', order_index: 6,
      title: 'WS6 — RLS Break / Edge Case Test',
      description: 'Try edge cases: direct endpoint access with wrong user, guessing project IDs from other orgs, accessing routes outside scope, querying tasks outside membership. RLS must block leakage. APIs must not overexpose. Classify any gaps found.',
    },
    {
      slug: 'ws7-auto-membership-gap', order_index: 7,
      title: 'WS7 — Auto-Membership Gap Test',
      description: 'Create User D fresh. Check whether they automatically receive org/workspace/project membership. If not, record exact gap, determine whether acceptable for current phase or requires immediate fix. Classify severity: CRITICAL / HIGH / MEDIUM. Migration 033 (auto-membership triggers) is planned but not yet applied.',
    },
  ]

  const { data: features, error: featErr } = await admin
    .from('features')
    .insert(workstreams.map(ws => ({
      project_id:  projectId,
      epic_id:     epicId,
      title:       ws.title,
      description: ws.description,
      slug:        ws.slug,
      status:      'pending',
      priority:    'high',
      order_index: ws.order_index,
    })))
    .select('id, slug, order_index')

  if (featErr) return NextResponse.json({ error: featErr.message }, { status: 500 })

  const featureMap: Record<string, string> = {}
  for (const f of features ?? []) featureMap[f.slug] = f.id

  // ── 3. Define Tasks ───────────────────────────────────────────────────────

  type TaskDef = {
    feature_slug: string
    title:        string
    description:  string
    agent_role:   string
    task_type:    string
    priority:     string
    order_index:  number
  }

  const tasks: TaskDef[] = [

    // ── WS1: Test User Creation ────────────────────────────────────────────
    {
      feature_slug: 'ws1-test-user-creation', order_index: 1,
      title: 'Create User A (owner@test.buildos.dev) via Supabase Auth Admin API',
      description: 'Using the Supabase Management API (POST /v1/projects/{ref}/auth/users), create User A with email owner@test.buildos.dev, a secure test password, email_confirm: true. This user will serve as the org owner for the RBAC reality test. After creation, verify the user appears in auth.users and that a corresponding row was created in public.users by the existing trigger. Record the auth.users UUID for use in WS2 membership setup.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'critical',
    },
    {
      feature_slug: 'ws1-test-user-creation', order_index: 2,
      title: 'Create User B (member@test.buildos.dev) via Supabase Auth Admin API',
      description: 'Create User B with email member@test.buildos.dev, email_confirm: true. This user will be assigned org member + workspace viewer + project viewer roles. Verify user appears in auth.users and public.users. Record UUID for WS2.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'critical',
    },
    {
      feature_slug: 'ws1-test-user-creation', order_index: 3,
      title: 'Create User C (external@test.buildos.dev) in a separate org context',
      description: 'Create User C with email external@test.buildos.dev, email_confirm: true. This user will belong to a completely separate organization to test cross-org isolation. Verify user appears in auth.users and public.users. Record UUID for WS2. Note: User C may need a new organization row created — check if the user creation trigger auto-creates one or if it must be done manually.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'critical',
    },
    {
      feature_slug: 'ws1-test-user-creation', order_index: 4,
      title: 'Create User D (newuser@test.buildos.dev) fresh — no manual membership',
      description: 'Create User D with email newuser@test.buildos.dev, email_confirm: true. Do NOT manually insert any membership rows for User D. This user is the auto-membership gap test subject. After creation, check whether the system automatically creates rows in organization_members, workspace_members, or project_members. Record whatever state exists before any WS2 intervention.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'high',
    },
    {
      feature_slug: 'ws1-test-user-creation', order_index: 5,
      title: 'DB verification: all 4 test users exist in auth.users and public.users',
      description: 'Run verification query: SELECT id, email, created_at FROM auth.users WHERE email LIKE \'%@test.buildos.dev\' ORDER BY created_at. Expect 4 rows. Then verify public.users: SELECT id, email, role, organization_id FROM users WHERE email LIKE \'%@test.buildos.dev\'. Confirm each user has a public.users row. Record any user without a public.users row — this would indicate the auth trigger is not firing correctly.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },

    // ── WS2: Membership Setup ──────────────────────────────────────────────
    {
      feature_slug: 'ws2-membership-setup', order_index: 1,
      title: 'Assign User A as organization owner in organization_members',
      description: 'Determine User A\'s organization_id from public.users. Insert into organization_members: (organization_id = User A org, user_id = User A id, role = \'owner\', status = \'active\'). Use ON CONFLICT DO NOTHING. Verify the row exists with correct role after insert.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'critical',
    },
    {
      feature_slug: 'ws2-membership-setup', order_index: 2,
      title: 'Assign User A as workspace admin and project admin',
      description: 'Insert into workspace_members: User A as admin for all workspaces in their org. Insert into project_members: User A as admin for all projects in their org. Use the same pattern as migration 031 seed logic. Verify rows exist in both tables.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'critical',
    },
    {
      feature_slug: 'ws2-membership-setup', order_index: 3,
      title: 'Assign User B as org member + workspace viewer + project viewer',
      description: 'Insert User B into organization_members (role: member, status: active) for User A\'s organization. Insert User B into workspace_members (role: viewer, status: active) for the first workspace. Insert User B into project_members (role: viewer) for the first project. Verify all three rows exist with correct roles.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'critical',
    },
    {
      feature_slug: 'ws2-membership-setup', order_index: 4,
      title: 'Create separate organization + workspace + project for User C',
      description: 'If User C does not have an auto-created organization, create one: INSERT INTO organizations (name, slug) VALUES (\'Test Org C\', \'test-org-c\'). Then create a workspace and project within it. Insert User C as org owner, workspace admin, and project admin for their separate org. This creates the isolation boundary for WS4 cross-org test.',
      agent_role: 'backend_engineer', task_type: 'infra', priority: 'high',
    },
    {
      feature_slug: 'ws2-membership-setup', order_index: 5,
      title: 'DB verification: all membership rows exist with correct roles',
      description: 'Run comprehensive membership verification: (1) SELECT om.role, u.email FROM organization_members om JOIN users u ON u.id=om.user_id WHERE u.email LIKE \'%@test.buildos.dev\'; (2) Same for workspace_members; (3) Same for project_members. Expect: User A = owner/admin/admin, User B = member/viewer/viewer, User C = owner/admin/admin in separate org, User D = no rows (gap test).',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },

    // ── WS3: Access Isolation Test ─────────────────────────────────────────
    {
      feature_slug: 'ws3-access-isolation', order_index: 1,
      title: 'DB proof: verify User B\'s RLS-scoped workspace visibility',
      description: 'Using the Management API, run: SET LOCAL role = authenticated; SET LOCAL request.jwt.claims = \'{"sub":"<USER_B_UUID>"}\'; SELECT * FROM workspaces; Verify User B sees only the workspace they have a membership row for. Confirm no workspaces from User C\'s org appear. Record exact row count.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws3-access-isolation', order_index: 2,
      title: 'API proof: call /api/workspaces as User B — verify scoped response',
      description: 'Generate a test JWT for User B (or use magic link to authenticate). Call GET /api/workspaces. Verify the response contains only the workspace User B is a member of. Record the workspace count. If >1 workspace appears for User B (who is only a member of 1), this is a leakage bug. Record the API response payload as proof.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws3-access-isolation', order_index: 3,
      title: 'API proof: User A sees all their workspaces (full owner access)',
      description: 'Authenticate as User A (or use their session). Call GET /api/workspaces. Verify all 3 workspaces (from existing data + any new test workspaces) are returned. Call GET /api/projects. Verify all projects are returned. User A should see everything in their org. Record response counts.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws3-access-isolation', order_index: 4,
      title: 'Mutation test: attempt PATCH on a project as User B (viewer) — expect rejection',
      description: 'Using User B\'s session, attempt PATCH /api/projects/{project_id} with a minor change (e.g., name update). Expect either 403 Forbidden or an empty response due to RLS blocking the UPDATE. If the patch succeeds, this is a CRITICAL gap — viewers should not be able to modify projects. Record the HTTP status and response body.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws3-access-isolation', order_index: 5,
      title: 'RLS function verification: buildos_current_org_ids() returns correct scope per user',
      description: 'Via Management API, verify: for User A — SELECT buildos_current_org_ids() returns their org UUID. For User B — SELECT buildos_current_org_ids() returns the same org UUID (they are a member). For User C — SELECT buildos_current_org_ids() returns only their separate org UUID. Document results. Any overlap between User C and User A/B org IDs = CRITICAL.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },

    // ── WS4: Cross-Org Isolation Test ─────────────────────────────────────
    {
      feature_slug: 'ws4-cross-org-isolation', order_index: 1,
      title: 'DB proof: User A cannot see User C\'s workspaces under RLS',
      description: 'Run SET LOCAL as User A. SELECT id, name FROM workspaces. Verify NONE of User C\'s workspace IDs appear. Then run SET LOCAL as User C. SELECT id, name FROM workspaces. Verify NONE of User A\'s workspaces appear. This is the definitive cross-org boundary test. Record both result sets as proof.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws4-cross-org-isolation', order_index: 2,
      title: 'API proof: User C cannot access User A\'s project via direct ID guess',
      description: 'Authenticate as User C. Attempt GET /api/projects/{user_a_project_id} — use a known project ID from User A\'s org. Expect 404 or empty data (RLS makes the row invisible, not 403). If the project details are returned, this is a CRITICAL security breach. Record HTTP status and response.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws4-cross-org-isolation', order_index: 3,
      title: 'DB proof: projects table RLS — User C sees zero rows from User A\'s org',
      description: 'Run SET LOCAL as User C. SELECT COUNT(*) FROM projects WHERE workspace_id IN (SELECT id FROM workspaces WHERE organization_id = <USER_A_ORG_ID>). Expect COUNT = 0. If any rows returned, the project RLS policy is broken. Record the count.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws4-cross-org-isolation', order_index: 4,
      title: 'Browser proof: log in as User C — confirm only User C org data visible',
      description: 'Using a magic link or direct login for User C, navigate to the Build OS dashboard. Verify the workspace dropdown shows only User C\'s workspace. Verify no project names from User A\'s org appear. Take a screenshot as browser proof. If cross-org data appears in the UI, classify as CRITICAL.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },

    // ── WS5: Role-Based UI Test ────────────────────────────────────────────
    {
      feature_slug: 'ws5-role-based-ui', order_index: 1,
      title: 'Browser proof: log in as User A (owner) — document full UI access',
      description: 'Authenticate as User A. Navigate dashboard, task board, and Smart Wizard. Document which controls are visible: create project button, task creation, project settings, admin actions. Take screenshots of key surfaces. This establishes the owner baseline for comparison with User B.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws5-role-based-ui', order_index: 2,
      title: 'Browser proof: log in as User B (viewer) — document restricted UI',
      description: 'Authenticate as User B. Navigate dashboard, task board, and Smart Wizard. Document which controls are visible vs hidden. Specifically check: can User B create tasks? Can User B open project settings? Can User B trigger Smart Wizard execution? If viewer and owner see identical UI, this is a HIGH gap — role differentiation is not implemented at the UI layer.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws5-role-based-ui', order_index: 3,
      title: 'Gap analysis: identify which UI actions are missing role gating',
      description: 'Compare User A and User B UI screenshots. For each action that User B can see/trigger that they should not be able to (based on viewer role), record it as a gap: [action, component, severity]. If no role differentiation exists at all in the UI (same controls visible for all roles), classify as HIGH and create a follow-up for role-gating implementation. Record gap list.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws5-role-based-ui', order_index: 4,
      title: 'FE fix: implement role-based UI gating if critical gaps found',
      description: 'If WS5 gap analysis finds CRITICAL gaps (viewer can trigger owner-only actions), implement basic role gating: use the user\'s membership role from the API to conditionally render/disable destructive or admin-only controls. Key components to gate: task create button, project settings link, Smart Wizard execution trigger, and any "Deploy" or "Run" controls. Use the existing membership data from the API if available.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws5-role-based-ui', order_index: 5,
      title: 'QA verify: role-based UI gating is working after fix',
      description: 'After any FE fixes, re-test User B in browser. Verify that owner-only actions are no longer accessible to viewers. Re-run the gap analysis and confirm all CRITICAL gaps are closed. Record final UI state for both User A and User B as browser proof.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },

    // ── WS6: RLS Break / Edge Case Test ───────────────────────────────────
    {
      feature_slug: 'ws6-rls-edge-cases', order_index: 1,
      title: 'Edge case: User B queries tasks table — verify RLS scoping',
      description: 'As User B, query tasks directly: SELECT COUNT(*) FROM tasks. Via DB proof (SET LOCAL as User B), confirm User B only sees tasks for projects they are a member of. If User B sees all 1000+ tasks from User A\'s projects, RLS on tasks is broken. Record exact count and compare against expected (tasks in User B\'s project membership only).',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws6-rls-edge-cases', order_index: 2,
      title: 'Edge case: direct UUID guessing — GET /api/projects/{unknown_id} as User B',
      description: 'As User B, attempt to call GET /api/projects/{project_id_from_user_a_org}. Expect 404 or empty — RLS should make the row invisible. If project data is returned, this is a CRITICAL gap. Try 3 different project IDs from User A\'s org. Record all responses.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },
    {
      feature_slug: 'ws6-rls-edge-cases', order_index: 3,
      title: 'Edge case: attempt to access /api/workspaces without auth token',
      description: 'Call GET /api/workspaces with no Authorization header or with an invalid JWT. Expect 401. Call POST /api/projects with no auth. Expect 401. These are basic auth boundary checks. If any endpoint returns data without authentication, classify as CRITICAL. Record HTTP status codes.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws6-rls-edge-cases', order_index: 4,
      title: 'Edge case: membership table direct access — User B cannot query other members',
      description: 'As User B, query: SELECT * FROM organization_members. Via RLS, User B should only see their own row (or rows within their org, depending on policy). Verify User B cannot see membership rows from User C\'s org. Record the exact row count returned. If User B sees ALL membership rows from all orgs, the organization_members RLS policy has a gap.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws6-rls-edge-cases', order_index: 5,
      title: 'Edge case: environment_variables table — User B cannot see other org secrets',
      description: 'As User B (viewer in User A\'s org), query environment_variables. Verify only variables for projects User B has membership in are returned. As User C, query environment_variables — should see ZERO rows from User A\'s org. Record results. Any cross-org secret leakage = CRITICAL.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'critical',
    },

    // ── WS7: Auto-Membership Gap Test ─────────────────────────────────────
    {
      feature_slug: 'ws7-auto-membership-gap', order_index: 1,
      title: 'Check User D organization_members row — does it exist auto-created?',
      description: 'User D was created fresh via Auth Admin API without manual membership inserts. Query: SELECT * FROM organization_members WHERE user_id = \'<USER_D_UUID>\'. If a row exists, the system auto-creates org membership on signup (good). If no row exists, the gap is confirmed: new users have no org membership until manually added. Record exact result.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws7-auto-membership-gap', order_index: 2,
      title: 'Check User D workspace_members and project_members rows',
      description: 'Query workspace_members and project_members for User D. If organization_members gap is confirmed, these will almost certainly also be missing. Confirm all three tables lack rows for User D. This is the full scope of the auto-membership gap. Record results for all three tables.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws7-auto-membership-gap', order_index: 3,
      title: 'Check public.users trigger — does it create organization on signup?',
      description: 'Inspect the handle_new_user trigger (or equivalent) that fires on auth.users INSERT. Determine: (1) does it create an organization for the new user? (2) does it create organization_members, workspace_members, project_members rows? If the trigger only creates a public.users row without membership rows, this is the root cause of the gap. Record trigger logic.',
      agent_role: 'backend_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws7-auto-membership-gap', order_index: 4,
      title: 'Classify auto-membership gap severity and determine fix phase',
      description: 'Based on WS7 findings, classify the auto-membership gap: CRITICAL (users can sign up but immediately have no access to anything, completely broken UX), HIGH (UX broken for new users but manually fixable), or MEDIUM (acceptable gap for single-tenant phase, migration 033 planned). For current single-owner single-tenant usage, classify as MEDIUM — migration 033 (auto-membership triggers) will address. Document classification with rationale.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
    {
      feature_slug: 'ws7-auto-membership-gap', order_index: 5,
      title: 'Document migration 033 requirements for auto-membership trigger',
      description: 'Based on gap findings, document the exact requirements for migration 033: (1) On auth.users INSERT, create organization, workspace, and project for first user — OR — join existing org if invited. (2) Create membership rows in all three tables at the appropriate role. (3) Handle edge case: invited user vs new org creation. Write migration 033 spec into a blocker or task comment for developer pickup. Do NOT implement — document only.',
      agent_role: 'backend_engineer', task_type: 'code', priority: 'medium',
    },

  ]

  // ── 4. Insert Tasks ───────────────────────────────────────────────────────

  const toSlug = (title: string, idx: number) =>
    title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60)
      .replace(/-+$/, '') + `-${idx + 1}`

  const taskInserts = tasks.map((t, idx) => ({
    project_id:    projectId,
    feature_id:    featureMap[t.feature_slug],
    title:         t.title,
    description:   t.description,
    agent_role:    t.agent_role,
    task_type:     t.task_type,
    priority:      t.priority,
    status:        'pending',
    order_index:   idx + 1,
    max_retries:   2,
    delivery_type: 'code',
    slug:          toSlug(t.title, idx),
  }))

  const { data: insertedTasks, error: taskErr } = await admin
    .from('tasks')
    .insert(taskInserts)
    .select('id')

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    epic_id:      epicId,
    workstreams:  workstreams.length,
    tasks_seeded: insertedTasks?.length ?? 0,
    summary: {
      ws1_test_user_creation: tasks.filter(t => t.feature_slug === 'ws1-test-user-creation').length,
      ws2_membership_setup:   tasks.filter(t => t.feature_slug === 'ws2-membership-setup').length,
      ws3_access_isolation:   tasks.filter(t => t.feature_slug === 'ws3-access-isolation').length,
      ws4_cross_org_isolation: tasks.filter(t => t.feature_slug === 'ws4-cross-org-isolation').length,
      ws5_role_based_ui:      tasks.filter(t => t.feature_slug === 'ws5-role-based-ui').length,
      ws6_rls_edge_cases:     tasks.filter(t => t.feature_slug === 'ws6-rls-edge-cases').length,
      ws7_auto_membership_gap: tasks.filter(t => t.feature_slug === 'ws7-auto-membership-gap').length,
    },
    agent_role_breakdown: {
      backend_engineer: tasks.filter(t => t.agent_role === 'backend_engineer').length,
      frontend_engineer: tasks.filter(t => t.agent_role === 'frontend_engineer').length,
      qa_engineer: tasks.filter(t => t.agent_role === 'qa_engineer').length,
    },
  })
}
