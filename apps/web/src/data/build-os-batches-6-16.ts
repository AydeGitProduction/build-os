/**
 * Build OS — Batches 6–12 + IRIS (Batch 16) Roadmap Data
 * Epics starting at order_index 20 (previous max was 19 from batches 1–5)
 */

export interface TaskDef {
  title: string
  description: string
  task_type: 'code' | 'review' | 'test' | 'schema' | 'document' | 'design' | 'deploy'
  priority: 'critical' | 'high' | 'medium' | 'low'
  assigned_to: string
  estimated_hours: number
}

export interface FeatureDef {
  title: string
  description: string
  tasks: TaskDef[]
}

export interface EpicDef {
  title: string
  description: string
  order_index: number
  features: FeatureDef[]
}

export const BATCHES_6_16: EpicDef[] = [
  // ─────────────────────────────────────────────────────────────
  // BATCH 6 — DEPLOYMENT & REAL OUTPUT
  // ─────────────────────────────────────────────────────────────
  {
    title: 'Deployment & Real Output',
    description: 'GitHub integration, PR approval workflow, and auto preview deployment on Vercel. Turns agent-generated code into real deployable output.',
    order_index: 20,
    features: [
      {
        title: 'GitHub Repository Integration',
        description: 'Connect Build OS projects to GitHub repos. Sync code output from agents to branches. Support OAuth connection and webhook setup.',
        tasks: [
          {
            title: 'Backend: GitHub OAuth & repository connection API',
            description: `## Objective
Implement GitHub OAuth flow and repository connection API for Build OS projects.

## Why it matters
Agents produce code but have no way to push it to a real repo. This bridges the gap between AI output and real version control.

## Implementation Steps
1. Add GitHub OAuth app credentials to env (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
2. Create /api/integrations/github/auth route — initiates OAuth flow
3. Create /api/integrations/github/callback route — exchanges code for token, stores encrypted in project_integrations table
4. Create /api/integrations/github/repos route — lists user repos via GitHub API
5. Create /api/projects/[id]/github route — links a repo to a project (stores repo_full_name, default_branch, installation_id)
6. Store GitHub token in project_integrations with type='github'

## Affected Files
- src/app/api/integrations/github/auth/route.ts (new)
- src/app/api/integrations/github/callback/route.ts (new)
- src/app/api/integrations/github/repos/route.ts (new)
- src/app/api/projects/[id]/github/route.ts (new)
- supabase: project_integrations table (type, credentials_encrypted, project_id)

## Expected Output
- OAuth flow works end-to-end
- Token stored securely
- Repo linked to project

## Edge Cases
- Token expiry — refresh flow
- User revokes GitHub access — graceful error
- Repo already linked to another project

## Acceptance Criteria
- [ ] OAuth completes and token stored
- [ ] Repos list returns user's repos
- [ ] Project-repo link persisted
- [ ] Auth errors return 401/400

## QA Checklist
- Test OAuth with real GitHub account
- Verify token encrypted at rest
- Verify repo link persists across sessions

## Handoff Notes
Token encryption: use AES-256 with ENCRYPTION_KEY env var`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 8,
          },
          {
            title: 'Frontend: GitHub connect UI and repo selector',
            description: `## Objective
Build the UI for connecting a GitHub account and selecting a repository to link to a project.

## Why it matters
Users need a clear, guided flow to connect their GitHub account and link a repo without leaving Build OS.

## Implementation Steps
1. Add "GitHub" card to /projects/[id]/integrations page
2. "Connect GitHub" button → initiates OAuth (redirect to /api/integrations/github/auth)
3. After OAuth callback, show repo selector modal — searchable list of user repos
4. On repo selection → POST /api/projects/[id]/github → show success state
5. Show connected repo name + branch in project settings sidebar

## Affected Files
- src/app/projects/[id]/integrations/page.tsx
- src/components/integrations/github-connect.tsx (new)
- src/components/integrations/repo-selector-modal.tsx (new)

## Expected Output
- Clean GitHub connection card
- Working repo selector modal with search
- Connected state displays repo name

## Edge Cases
- OAuth popup blocked by browser
- No repos found
- Disconnect and reconnect flow

## Acceptance Criteria
- [ ] GitHub card visible in integrations
- [ ] OAuth flow redirects correctly
- [ ] Repo selector shows real repos
- [ ] Connected state persists on refresh

## QA Checklist
- Test on Chrome, Firefox, Safari
- Verify search filters repos correctly
- Verify disconnect works

## Handoff Notes
Use existing Modal component. GitHub icon: lucide-react GitBranch.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 6,
          },
          {
            title: 'Backend: GitHub webhook handler for push/PR events',
            description: `## Objective
Receive and process GitHub webhook events (push, pull_request) to sync agent-generated code state with Build OS.

## Why it matters
Real-time sync between GitHub and Build OS lets the system know when code was pushed, PRs opened, or merges completed — driving automated task state transitions.

## Implementation Steps
1. Create /api/integrations/github/webhook route (POST)
2. Verify webhook signature (GITHUB_WEBHOOK_SECRET)
3. Handle events: push → update task status; pull_request.opened → create PR record; pull_request.merged → mark task completed
4. Store webhook events in github_events table for audit
5. Fire orchestration tick on relevant events

## Affected Files
- src/app/api/integrations/github/webhook/route.ts (new)
- supabase: github_events table (event_type, payload, project_id, processed_at)

## Expected Output
- Webhook validates signature
- Push events update task state
- PR events logged and trigger ticks

## Edge Cases
- Duplicate events (GitHub retries)
- Events for unlinked repos
- Invalid signature → 401

## Acceptance Criteria
- [ ] Signature validation works
- [ ] Push event updates task status
- [ ] PR open/merge triggers correct state change
- [ ] Events stored in audit table

## QA Checklist
- Use GitHub webhook tester (smee.io for local, direct for prod)
- Test duplicate event handling
- Verify malformed payloads return 400

## Handoff Notes
GitHub sends X-Hub-Signature-256 header. Use crypto.timingSafeEqual for comparison.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'integration_engineer',
            estimated_hours: 6,
          },
        ],
      },
      {
        title: 'PR Approval Workflow',
        description: 'Implement pull request creation, review, and approval flow so agent-generated code goes through a human (or automated) review gate before merging.',
        tasks: [
          {
            title: 'Backend: PR creation and approval API',
            description: `## Objective
API to create GitHub PRs from completed tasks and track approval status within Build OS.

## Why it matters
Ensures code quality gate exists between agent output and production. No merge without approval.

## Implementation Steps
1. Create /api/projects/[id]/prs route (GET list, POST create)
2. POST body: { task_id, branch, title, description } → calls GitHub API to open PR
3. Store PR in project_prs table (pr_number, task_id, status, url)
4. GET returns PRs with status (open/approved/merged/closed)
5. Create /api/projects/[id]/prs/[pr_id]/approve route — adds approval, triggers merge if auto_merge enabled
6. Webhook handler updates PR status on review events

## Affected Files
- src/app/api/projects/[id]/prs/route.ts (new)
- src/app/api/projects/[id]/prs/[pr_id]/approve/route.ts (new)
- supabase: project_prs table

## Expected Output
- PRs created via API
- Approval tracked
- Auto-merge when approved

## Edge Cases
- GitHub API rate limits
- Branch doesn't exist
- PR already exists for same branch

## Acceptance Criteria
- [ ] PR created on GitHub via API
- [ ] PR status synced from webhook
- [ ] Approval triggers merge
- [ ] Rate limit handled gracefully

## QA Checklist
- Create PR via API, verify it appears on GitHub
- Test approval flow end-to-end
- Verify merge triggers task state = completed

## Handoff Notes
Use octokit/rest for GitHub API calls. Store token from project_integrations.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 8,
          },
          {
            title: 'Frontend: PR review panel and approval UI',
            description: `## Objective
Build the PR review panel in Build OS command center — shows open PRs, diff summary, and approve/reject controls.

## Why it matters
Human oversight of AI-generated code needs a clean review surface inside the Build OS UI, not just GitHub.

## Implementation Steps
1. Add "Pull Requests" tab to command center or project tasks page
2. List open PRs with task name, branch, creation date, status badge
3. Click PR → expand panel showing: title, description, file changes count, link to GitHub
4. "Approve" button → POST /api/projects/[id]/prs/[pr_id]/approve
5. Show approval status update inline
6. Filter by status (open/approved/merged)

## Affected Files
- src/app/projects/[id]/tasks/page.tsx (add PR tab)
- src/components/prs/pr-list.tsx (new)
- src/components/prs/pr-panel.tsx (new)

## Expected Output
- Clean PR list with status badges
- Expand/approve flow works
- Real-time status updates

## Edge Cases
- No PRs → empty state
- GitHub link broken
- Approval fails → show error inline

## Acceptance Criteria
- [ ] PR list loads correctly
- [ ] Expand panel shows correct info
- [ ] Approve action works and updates status
- [ ] Filter by status works

## QA Checklist
- Test with 0, 1, 10 PRs
- Verify approve button disabled when already approved
- Test on mobile viewport

## Handoff Notes
Use existing badge/status components. PR status colors: open=blue, approved=green, merged=purple, closed=red.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 6,
          },
          {
            title: 'QA: PR approval flow end-to-end validation',
            description: `## Objective
Validate the full PR approval flow: creation → review → approval → merge → task state update.

## Why it matters
This is a critical quality gate. If it breaks, AI code ships unreviewed or tasks get stuck.

## Implementation Steps
1. Write integration tests for /api/projects/[id]/prs routes
2. Test GitHub webhook event handling (mock events)
3. Validate task state transitions on PR events
4. Test auto-merge toggle behavior
5. Verify UI state reflects API changes in real-time

## Affected Files
- tests/api/prs.test.ts (new)
- tests/integration/github-flow.test.ts (new)

## Expected Output
- All PR flow paths tested and passing

## Edge Cases
- Concurrent approvals
- PR closed without merge
- Webhook delivery failure

## Acceptance Criteria
- [ ] PR create/approve/merge cycle passes
- [ ] Task state updates correctly on merge
- [ ] All edge cases handled with proper errors

## QA Checklist
- Run with real GitHub test repo
- Verify no task gets stuck in dispatched after merge
- Confirm audit log entries created

## Handoff Notes
Use GitHub test org with dedicated test repo for CI/CD.`,
            task_type: 'test',
            priority: 'medium',
            assigned_to: 'qa_security_auditor',
            estimated_hours: 5,
          },
        ],
      },
      {
        title: 'Auto Preview Deployment',
        description: 'Automatically create Vercel preview deployments from agent-generated branches so stakeholders can review running apps, not just code diffs.',
        tasks: [
          {
            title: 'Backend: Auto preview deploy pipeline integration',
            description: `## Objective
Trigger Vercel preview deployments automatically when agents push code to feature branches.

## Why it matters
Stakeholders can review a running app, not just code. Closes the loop between AI development and real output.

## Implementation Steps
1. On PR creation event → call Vercel Deploy API with branch ref
2. Store deployment in project_deployments table (url, status, branch, pr_number, created_at)
3. Create /api/projects/[id]/deployments route — list deployments with status/url
4. Poll or webhook Vercel for deployment status updates
5. Notify via project activity feed when preview is ready

## Affected Files
- src/app/api/projects/[id]/deployments/route.ts (new)
- src/lib/vercel-deploy.ts (new — Vercel API client)
- supabase: project_deployments table

## Expected Output
- Preview URL generated per PR branch
- Status tracked (building/ready/error)
- Activity feed updated

## Edge Cases
- Vercel rate limits
- Build fails → mark deployment as failed, don't block task
- Multiple PRs for same branch

## Acceptance Criteria
- [ ] Preview URL created per PR
- [ ] Deployment status tracked correctly
- [ ] Failed deploys don't block workflow
- [ ] Activity feed shows deploy events

## QA Checklist
- Verify preview URL is accessible
- Test build failure handling
- Confirm status polling works

## Handoff Notes
Vercel API: POST https://api.vercel.com/v13/deployments with Authorization: Bearer TOKEN`,
            task_type: 'code',
            priority: 'medium',
            assigned_to: 'backend_engineer',
            estimated_hours: 7,
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BATCH 7 — INTEGRATION ECOSYSTEM
  // ─────────────────────────────────────────────────────────────
  {
    title: 'Integration Ecosystem',
    description: 'Stripe payments, third-party API manager, and integration marketplace. Makes Build OS projects production-ready with real payment and integration infrastructure.',
    order_index: 21,
    features: [
      {
        title: 'Stripe Payment Integration',
        description: 'Full Stripe integration: checkout, subscriptions, webhooks, billing portal. Locked decision: Stripe is the payment provider.',
        tasks: [
          {
            title: 'Backend: Stripe checkout, subscriptions, and webhook handler',
            description: `## Objective
Implement Stripe integration: checkout sessions, subscription lifecycle, and webhook event handler.

## Why it matters
Build OS needs real payment infrastructure to monetize projects it builds and to serve as a reference implementation.

## Implementation Steps
1. Install stripe npm package, add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to env
2. Create /api/billing/checkout route — creates Stripe Checkout session
3. Create /api/billing/portal route — creates billing portal session for subscription management
4. Create /api/billing/webhook route — handles: checkout.session.completed, customer.subscription.updated/deleted, invoice.payment_failed
5. Store subscription state in user_subscriptions table (stripe_customer_id, stripe_subscription_id, status, plan_id, current_period_end)
6. Update project plan limits based on subscription

## Affected Files
- src/app/api/billing/checkout/route.ts (new)
- src/app/api/billing/portal/route.ts (new)
- src/app/api/billing/webhook/route.ts (new)
- src/lib/stripe.ts (new — Stripe client)
- supabase: user_subscriptions table

## Expected Output
- Checkout flow works end-to-end
- Subscriptions update correctly from webhooks
- Portal allows plan management

## Edge Cases
- Duplicate webhook events (idempotency via Stripe event ID)
- Payment failure → downgrade plan immediately
- Subscription cancelled mid-period → maintain access until period end

## Acceptance Criteria
- [ ] Checkout creates Stripe customer and subscription
- [ ] Webhook updates subscription status correctly
- [ ] Payment failure handled with correct downgrade
- [ ] Portal session works

## QA Checklist
- Use Stripe test mode with test cards
- Test all webhook event types
- Verify idempotency with duplicate events

## Handoff Notes
Always verify webhook signature using stripe.webhooks.constructEvent. Use Stripe CLI for local webhook testing.`,
            task_type: 'code',
            priority: 'critical',
            assigned_to: 'backend_engineer',
            estimated_hours: 10,
          },
          {
            title: 'Frontend: Pricing page and billing management UI',
            description: `## Objective
Build pricing page with plan comparison and billing management UI for subscription upgrades/downgrades.

## Why it matters
Clear pricing presentation and self-service billing drives conversion and reduces support load.

## Implementation Steps
1. Create /pricing page — 3-tier pricing cards (Starter/Pro/Enterprise) with feature comparison table
2. "Get Started" → redirects to /api/billing/checkout with selected plan
3. Create /settings/billing page — shows current plan, next billing date, usage stats
4. "Manage Billing" button → calls /api/billing/portal and redirects to Stripe portal
5. Show plan badge in navigation header

## Affected Files
- src/app/pricing/page.tsx (new)
- src/app/settings/billing/page.tsx (new)
- src/components/billing/pricing-card.tsx (new)
- src/components/billing/billing-status.tsx (new)

## Expected Output
- Clean pricing page with 3 tiers
- Billing settings page with current plan

## Edge Cases
- User not logged in on pricing page → show login prompt after plan select
- Trial period shown separately
- Enterprise tier → "Contact Us" CTA

## Acceptance Criteria
- [ ] Pricing page renders all 3 tiers
- [ ] Checkout redirect works per plan
- [ ] Billing page shows correct subscription info
- [ ] Portal redirect works

## QA Checklist
- Test pricing page on mobile
- Verify checkout works for each tier
- Confirm billing page updates after subscription change

## Handoff Notes
Use Stripe test publishable key (pk_test_...) for frontend. Never expose secret key.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 7,
          },
        ],
      },
      {
        title: 'Integration Marketplace',
        description: 'Marketplace where users browse, connect, and manage third-party integrations (Slack, Jira, Notion, etc.) for their Build OS projects.',
        tasks: [
          {
            title: 'Backend: Integration marketplace registry and connection API',
            description: `## Objective
Build the integration registry — a catalog of available integrations — and the API to connect/disconnect them per project.

## Why it matters
Projects need integrations (Slack notifications, Jira sync, Notion docs) to be production-useful. A marketplace makes this self-service.

## Implementation Steps
1. Create integration_providers table: (id, name, slug, description, icon_url, oauth_url, category, is_available)
2. Seed: Slack, GitHub, Jira, Notion, Linear, Vercel, Stripe
3. Create /api/integrations/providers route — lists available integrations
4. Create /api/projects/[id]/integrations route — GET project integrations, POST connect, DELETE disconnect
5. Generic OAuth callback handler at /api/integrations/[provider]/callback

## Affected Files
- src/app/api/integrations/providers/route.ts
- src/app/api/projects/[id]/integrations/route.ts
- supabase: integration_providers table, project_integrations table

## Expected Output
- Provider catalog seeded
- Connect/disconnect works
- Connected state persisted

## Edge Cases
- Provider not available yet (show "Coming Soon")
- Connection fails mid-OAuth
- User connects same provider twice

## Acceptance Criteria
- [ ] Provider list returns seeded integrations
- [ ] Connect flow creates project_integrations record
- [ ] Disconnect removes record cleanly
- [ ] Coming soon integrations handled gracefully

## QA Checklist
- Verify all seeded providers appear
- Test connect/disconnect cycle
- Test duplicate connection handling

## Handoff Notes
integration_providers.is_available controls Coming Soon state. Don't expose OAuth credentials to frontend.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 7,
          },
          {
            title: 'Frontend: Integration marketplace browser UI',
            description: `## Objective
Build the integration marketplace UI — a searchable, filterable catalog of integrations with connect/disconnect controls.

## Why it matters
Users need a self-service interface to browse and manage integrations without developer help.

## Implementation Steps
1. /projects/[id]/integrations page — grid of integration cards
2. Filter by category (Dev Tools, Productivity, Communication, Payments)
3. Search bar — real-time filter by name
4. Each card: icon, name, description, status badge (Connected/Available/Coming Soon)
5. "Connect" → initiates OAuth or shows config modal
6. "Disconnect" → confirmation dialog → DELETE
7. Connected integrations show last sync time

## Affected Files
- src/app/projects/[id]/integrations/page.tsx (enhance existing)
- src/components/integrations/integration-card.tsx (new)
- src/components/integrations/integration-grid.tsx (new)

## Expected Output
- Marketplace with search and category filters
- Connect/disconnect flow in UI

## Edge Cases
- Offline — show cached integration states
- Coming soon cards are non-interactive
- Category filter shows "All" by default

## Acceptance Criteria
- [ ] All seeded integrations shown in grid
- [ ] Search filters by name/description
- [ ] Category filter works
- [ ] Connect/disconnect updates card state

## QA Checklist
- Test search with partial/full names
- Verify Coming Soon cards non-clickable
- Test on mobile viewport

## Handoff Notes
Icons from integration_providers.icon_url or fallback to lucide-react icons.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 6,
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BATCH 8 — SUPER ADMIN & ANALYTICS
  // ─────────────────────────────────────────────────────────────
  {
    title: 'Super Admin & Analytics',
    description: 'Real-time analytics dashboard, super admin control panel, and alert system (Telegram + Slack). Locked: real-time data, Telegram + Slack alerts.',
    order_index: 22,
    features: [
      {
        title: 'Real-time Analytics Dashboard',
        description: 'Live metrics: active tasks, agent throughput, cost per task, success rate, queue depth — all updating in real-time.',
        tasks: [
          {
            title: 'Backend: Analytics aggregation API with real-time subscriptions',
            description: `## Objective
Build the analytics API: aggregated metrics endpoint + Supabase Realtime subscription support for live dashboard updates.

## Why it matters
Real-time visibility into agent activity is essential for supervising autonomous systems and detecting problems before they escalate.

## Implementation Steps
1. Create /api/analytics/overview route — returns: active_tasks, dispatched_tasks, completed_today, failed_today, avg_task_duration_ms, total_cost_today, queue_depth per queue
2. Create /api/analytics/throughput route — returns tasks completed per hour for last 24h (array of {hour, count})
3. Create /api/analytics/agents route — per-agent stats: tasks_completed, avg_duration, success_rate, cost
4. Add Supabase Realtime channel subscription logic in lib/analytics.ts for live task updates
5. Cache aggregations with 30s TTL to avoid DB hammering

## Affected Files
- src/app/api/analytics/overview/route.ts (new)
- src/app/api/analytics/throughput/route.ts (new)
- src/app/api/analytics/agents/route.ts (new)
- src/lib/analytics.ts (new)

## Expected Output
- Overview API returns all key metrics
- Throughput chart data correct
- Per-agent stats accurate

## Edge Cases
- No tasks yet — return zeros, not errors
- DB timeout — return cached data
- Large datasets — use COUNT queries, not row fetches

## Acceptance Criteria
- [ ] Overview returns all required fields
- [ ] Throughput data covers 24h window
- [ ] Caching reduces redundant DB calls
- [ ] Real-time subscription fires on task updates

## QA Checklist
- Verify zero-state responses
- Load test with 500+ tasks
- Verify cache invalidation on new task

## Handoff Notes
Use Supabase .channel('tasks_realtime') for real-time. Cache in-memory with Map + timestamp.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 8,
          },
          {
            title: 'Frontend: Real-time analytics dashboard UI',
            description: `## Objective
Build the real-time analytics dashboard — live KPI cards, throughput chart, agent performance table.

## Why it matters
Founders and supervisors need at-a-glance visibility into what the autonomous system is doing right now.

## Implementation Steps
1. Create /analytics page with 3 sections: KPI overview, throughput chart, agent table
2. KPI cards: Active Tasks, Completed Today, Failed Today, Queue Depth, Cost Today, Avg Duration
3. Throughput chart: area chart (recharts) showing tasks/hour for 24h
4. Agent table: columns [Agent, Tasks Completed, Avg Duration, Success Rate, Cost]
5. Poll /api/analytics/overview every 15s OR use Supabase Realtime
6. Flash animation on KPI change

## Affected Files
- src/app/analytics/page.tsx (new or enhance)
- src/components/analytics/kpi-card.tsx (new)
- src/components/analytics/throughput-chart.tsx (new)
- src/components/analytics/agent-table.tsx (new)

## Expected Output
- Live dashboard with auto-refresh
- Charts and tables populated

## Edge Cases
- No data → zero state with helpful message
- Realtime connection drops → fallback to polling
- Very long agent names → truncate with tooltip

## Acceptance Criteria
- [ ] KPI cards show correct live values
- [ ] Chart updates every 15s
- [ ] Agent table sortable by column
- [ ] Responsive on tablet

## QA Checklist
- Test with active tasks running
- Verify chart renders with 1, 12, 24 data points
- Confirm mobile layout

## Handoff Notes
Use recharts AreaChart for throughput. Color scheme: match existing Build OS design tokens.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 7,
          },
        ],
      },
      {
        title: 'Super Admin Control Panel',
        description: 'Super admin interface to manage users, projects, workspaces, agent configs, and system-wide settings across all tenants.',
        tasks: [
          {
            title: 'Backend: Super admin API with multi-tenant management',
            description: `## Objective
Super admin API for managing users, projects, and system settings across all tenants.

## Why it matters
Platform admins need elevated access to diagnose issues, manage accounts, and configure system-wide settings without touching the DB directly.

## Implementation Steps
1. Add is_super_admin column to profiles table
2. Create /api/admin/* routes with super admin guard middleware
3. /api/admin/users — list all users, suspend/activate, reset password link
4. /api/admin/projects — list all projects across workspaces, force stop, view stats
5. /api/admin/system — get/set system config (max_agents_global, maintenance_mode, etc.)
6. Audit all admin actions to admin_audit_log table

## Affected Files
- src/app/api/admin/users/route.ts (new)
- src/app/api/admin/projects/route.ts (new)
- src/app/api/admin/system/route.ts (new)
- src/middleware/admin-guard.ts (new)
- supabase: admin_audit_log table, is_super_admin on profiles

## Expected Output
- Super admin routes work with elevated access
- All actions audited
- Regular users get 403

## Edge Cases
- Super admin accidentally deletes own account
- Concurrent admin actions on same resource
- Admin session expiry

## Acceptance Criteria
- [ ] Non-admin gets 403 on all /api/admin routes
- [ ] User list returns all users
- [ ] Project force-stop works
- [ ] All actions appear in audit log

## QA Checklist
- Test 403 for regular user
- Test all admin operations
- Verify audit log completeness

## Handoff Notes
Super admin flag set manually in DB for initial bootstrapping. Never expose via API.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 8,
          },
          {
            title: 'Frontend: Super admin panel UI',
            description: `## Objective
Build the super admin panel — a separate /admin section with user management, project overview, and system controls.

## Why it matters
Admins need UI tools to manage the platform without database access.

## Implementation Steps
1. Create /admin layout with admin auth guard (redirect if not super_admin)
2. /admin/users page — table of all users with search, status badge, suspend/activate action
3. /admin/projects page — all projects across tenants with task counts, status, force stop
4. /admin/system page — system config sliders (max_agents_global, maintenance_mode toggle)
5. Audit log viewer showing recent admin actions

## Affected Files
- src/app/admin/layout.tsx (new)
- src/app/admin/users/page.tsx (new)
- src/app/admin/projects/page.tsx (new)
- src/app/admin/system/page.tsx (new)

## Expected Output
- Admin section accessible to super admins only
- User and project management working

## Edge Cases
- Admin viewing their own account — disable self-suspend
- Maintenance mode toggle — shows confirmation dialog
- Search with no results

## Acceptance Criteria
- [ ] /admin redirects non-admins to /projects
- [ ] User table loads and actions work
- [ ] System config changes persist
- [ ] Audit log shows recent actions

## QA Checklist
- Test as non-admin (expect redirect)
- Test suspend/activate user flow
- Verify maintenance mode toggle

## Handoff Notes
Admin check: fetch /api/admin/me — if 403, redirect to /projects.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 6,
          },
        ],
      },
      {
        title: 'Alert System (Telegram + Slack)',
        description: 'Real-time alerting system that sends notifications to Telegram and Slack for critical events: task failures, escalations, cost spikes, loop stalls.',
        tasks: [
          {
            title: 'Backend: Alert engine with Telegram and Slack dispatch',
            description: `## Objective
Alert engine that fires Telegram and Slack notifications for critical Build OS events.

## Why it matters
The autonomous loop runs unattended. Real-time alerts are the only way founders know something went wrong without checking the dashboard constantly.

## Implementation Steps
1. Create lib/alerts.ts with sendAlert(type, data) function
2. Alert types: task_escalated, loop_stalled, cost_spike, task_failed_max_retries, deployment_failed
3. Telegram: POST https://api.telegram.org/bot{TOKEN}/sendMessage — format with emojis, task link
4. Slack: POST to webhook URL with Block Kit message
5. Create /api/alerts/config route — GET/PUT user alert preferences (which events, which channels)
6. Store alert history in alert_events table

## Affected Files
- src/lib/alerts.ts (new)
- src/app/api/alerts/config/route.ts (new)
- supabase: alert_events table, alert_configs table
- Integration into watchdog and recovery routes

## Expected Output
- Telegram and Slack messages fire on critical events
- Alert preferences configurable per workspace
- Alert history queryable

## Edge Cases
- Telegram/Slack API down — log and retry once, then skip
- Too many alerts (spam) — deduplicate within 5min window
- No alert config — default to Telegram if TELEGRAM_BOT_TOKEN set

## Acceptance Criteria
- [ ] Telegram message fires on task escalation
- [ ] Slack message fires on cost spike
- [ ] Deduplication prevents spam
- [ ] Alert history stored

## QA Checklist
- Trigger test alert → verify Telegram receipt
- Trigger test alert → verify Slack receipt
- Verify dedup window works

## Handoff Notes
Add TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SLACK_WEBHOOK_URL to env. Format Telegram with HTML parse_mode for bold/links.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 7,
          },
          {
            title: 'Frontend: Alert configuration UI',
            description: `## Objective
UI for configuring which alerts fire to which channels — per workspace settings panel.

## Why it matters
Users need to control alert noise. Different teams want different alerts on different channels.

## Implementation Steps
1. Add "Alerts" section to /settings or /projects/[id]/system page
2. Toggle switches for each alert type (task_escalated, loop_stalled, cost_spike, etc.)
3. Per-toggle: select channel (Telegram, Slack, Both, None)
4. Input fields: Telegram Bot Token, Telegram Chat ID, Slack Webhook URL (masked after save)
5. "Test Alert" button per channel — sends test notification
6. Save → PUT /api/alerts/config

## Affected Files
- src/app/settings/alerts/page.tsx (new)
- src/components/alerts/alert-config-panel.tsx (new)

## Expected Output
- Alert config UI with toggles and channel selectors
- Test button fires real notification

## Edge Cases
- Invalid Telegram/Slack credentials — show error after test
- All alerts disabled — show warning banner
- Credentials partially filled

## Acceptance Criteria
- [ ] All alert types shown with toggles
- [ ] Test alert button works for each channel
- [ ] Config saves and persists
- [ ] Invalid credentials show clear error

## QA Checklist
- Test with real Telegram bot
- Test with real Slack webhook
- Test save/reload persistence

## Handoff Notes
Mask credentials after save (show last 4 chars). Use controlled inputs with asterisk masking.`,
            task_type: 'code',
            priority: 'medium',
            assigned_to: 'frontend_engineer',
            estimated_hours: 5,
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BATCH 9 — BILLING & MONETIZATION
  // ─────────────────────────────────────────────────────────────
  {
    title: 'Billing & Monetization',
    description: 'Hybrid pricing engine (subscription + usage-based), subscription lifecycle management, and invoicing. Makes Build OS a real SaaS business.',
    order_index: 23,
    features: [
      {
        title: 'Hybrid Pricing Engine',
        description: 'Combine flat subscription tiers with usage-based overages — the hybrid model. Plan limits enforced in real-time across the system.',
        tasks: [
          {
            title: 'Backend: Plan limits enforcement and usage metering',
            description: `## Objective
Implement plan limits (max projects, max tasks/month, max agents) with real-time enforcement and usage metering for overage billing.

## Why it matters
Hybrid pricing only works if limits are actually enforced. Without enforcement, all users get unlimited access regardless of plan.

## Implementation Steps
1. Create plan_definitions table: (id, name, max_projects, max_tasks_per_month, max_parallel_agents, price_monthly, overage_per_task)
2. Seed: Free (1 proj, 50 tasks, 1 agent), Pro (5 proj, 500 tasks, 4 agents, $49/mo), Enterprise (unlimited, $299/mo)
3. Create lib/plan-limits.ts: checkProjectLimit(userId), checkTaskLimit(projectId), getOverageCount(userId, month)
4. Integrate limit checks into: POST /api/projects (project creation), task dispatch (pre-dispatch check)
5. Return HTTP 402 Payment Required with plan upgrade prompt when limit exceeded
6. Track monthly usage in usage_events table (user_id, event_type, project_id, month_bucket)

## Affected Files
- src/lib/plan-limits.ts (new)
- src/app/api/projects/route.ts (add limit check)
- src/app/api/dispatch/task/route.ts (add limit check)
- supabase: plan_definitions, usage_events tables

## Expected Output
- 402 returned when limits exceeded
- Usage tracked per month per user
- Overage calculated correctly

## Edge Cases
- Month rollover — reset usage counters
- User upgrades plan mid-month — immediately grant new limits
- Race conditions on concurrent task dispatch

## Acceptance Criteria
- [ ] Free user blocked at 50 tasks
- [ ] 402 returned with upgrade prompt
- [ ] Usage tracked in usage_events
- [ ] Overage calculated correctly at end of month

## QA Checklist
- Test Free tier limit enforcement
- Test upgrade mid-month
- Verify month rollover resets counts

## Handoff Notes
month_bucket: store as 'YYYY-MM' string for easy filtering.`,
            task_type: 'code',
            priority: 'critical',
            assigned_to: 'backend_engineer',
            estimated_hours: 9,
          },
          {
            title: 'Frontend: Plan upgrade prompts and usage dashboard',
            description: `## Objective
Build usage dashboard and plan upgrade prompts triggered when limits are approached or exceeded.

## Why it matters
Clear, well-timed upgrade prompts convert free users to paid. A usage dashboard prevents surprise overages.

## Implementation Steps
1. /settings/usage page — current plan, usage bar per metric (tasks used / limit, projects used / limit)
2. Usage bars turn orange at 80%, red at 95%
3. When API returns 402 — show upgrade modal with plan comparison and CTA
4. Upgrade CTA → /pricing with pre-selected recommended plan
5. Show "X tasks remaining this month" badge on project dashboard
6. Email notification at 80% (backend trigger, FE just shows setting)

## Affected Files
- src/app/settings/usage/page.tsx (new)
- src/components/billing/usage-bar.tsx (new)
- src/components/billing/upgrade-modal.tsx (new)
- src/hooks/use-plan-limits.ts (new)

## Expected Output
- Usage page shows current consumption
- Upgrade modal fires on limit hit
- Usage bars with color progression

## Edge Cases
- Unlimited plan (Enterprise) — hide usage bars
- 0 usage — show empty bars, not errors
- Multiple 402s in quick succession — show modal once

## Acceptance Criteria
- [ ] Usage page loads correct data
- [ ] Bars change color at 80% and 95%
- [ ] 402 triggers upgrade modal
- [ ] Upgrade modal links to pricing

## QA Checklist
- Test at 0%, 80%, 95%, 100% usage
- Test upgrade modal dedup
- Verify Enterprise plan shows no usage bars

## Handoff Notes
Intercept 402 responses globally in axios/fetch interceptor to show modal.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 6,
          },
        ],
      },
      {
        title: 'Subscription Management',
        description: 'Full subscription lifecycle: trial periods, upgrades, downgrades, cancellation, reactivation, and invoice history.',
        tasks: [
          {
            title: 'Backend: Subscription lifecycle management',
            description: `## Objective
Handle the full subscription lifecycle: trial start/end, upgrade/downgrade, cancellation, reactivation — all synced from Stripe webhooks.

## Why it matters
Subscriptions that don't track state correctly lose revenue or give free access inappropriately.

## Implementation Steps
1. Extend user_subscriptions: add trial_end, cancel_at_period_end, cancelled_at, reactivated_at
2. Handle Stripe webhook events: customer.subscription.trial_will_end, customer.subscription.updated, customer.subscription.deleted
3. Create /api/billing/cancel route — sets cancel_at_period_end=true via Stripe API
4. Create /api/billing/reactivate route — removes cancellation, re-enables subscription
5. On trial end → send email notification (via Resend/SendGrid)
6. Downgrade: when subscription.updated with lower tier → immediately enforce new limits

## Affected Files
- src/app/api/billing/cancel/route.ts (new)
- src/app/api/billing/reactivate/route.ts (new)
- src/app/api/billing/webhook/route.ts (extend)
- supabase: user_subscriptions (extend)

## Expected Output
- Cancel/reactivate work via API
- Limits updated immediately on downgrade
- Trial end email sent

## Edge Cases
- Cancel then reactivate same day
- Downgrade from Enterprise to Free — archive excess projects
- Stripe webhook retry after our server error

## Acceptance Criteria
- [ ] Cancel sets cancel_at_period_end
- [ ] Reactivate removes cancellation
- [ ] Downgrade enforces limits within 60s
- [ ] Trial end triggers notification

## QA Checklist
- Test cancel/reactivate cycle
- Test downgrade limit enforcement
- Use Stripe test clock for trial simulation

## Handoff Notes
Use Stripe test clocks (in test mode) to simulate trial end without waiting.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 8,
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BATCH 10 — TEMPLATE ENGINE
  // ─────────────────────────────────────────────────────────────
  {
    title: 'Template Engine',
    description: 'Niche template library for common SaaS patterns, customizable project templates, and import/export functionality. Locked: niche templates.',
    order_index: 24,
    features: [
      {
        title: 'Niche Template Library',
        description: 'Library of pre-built project templates for common SaaS niches: marketplace, fintech, devtool, edtech, healthtech. Each template includes epics, features, and starter tasks.',
        tasks: [
          {
            title: 'Backend: Template storage, retrieval, and project instantiation API',
            description: `## Objective
API for storing, retrieving, and applying project templates to new or existing projects.

## Why it matters
Templates dramatically reduce time to first task. Instead of 2h of planning, users get a production-ready roadmap in 30 seconds.

## Implementation Steps
1. Create project_templates table: (id, name, slug, category, description, preview_image_url, is_public, data JSONB)
2. data JSONB stores: {epics: [...], features: [...], tasks: [...]} as template schema
3. Create /api/templates route — GET list (filter by category), POST create new template
4. Create /api/templates/[slug] route — GET single template
5. Create /api/projects/[id]/apply-template route — POST with template_slug → inserts epics/features/tasks from template into project
6. Seed 5 niche templates: marketplace, devtool, fintech, edtech, saas-starter

## Affected Files
- src/app/api/templates/route.ts (new)
- src/app/api/templates/[slug]/route.ts (new)
- src/app/api/projects/[id]/apply-template/route.ts (new)
- src/data/templates/ directory with template JSON files
- supabase: project_templates table

## Expected Output
- 5 niche templates seeded
- Apply template populates project with tasks
- Templates browsable by category

## Edge Cases
- Apply template to non-empty project — ask for confirmation, don't duplicate
- Template schema version mismatch
- Template with 0 tasks (invalid — reject on creation)

## Acceptance Criteria
- [ ] 5 templates seeded and retrievable
- [ ] Apply template creates correct tasks
- [ ] Category filter works
- [ ] Empty project gets templated correctly

## QA Checklist
- Apply each of 5 templates to fresh project
- Verify task count matches template definition
- Test category filter returns correct subset

## Handoff Notes
Template data stored as JSONB for flexibility. Version field in data for future migrations.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 8,
          },
          {
            title: 'Frontend: Template browser and project template selection UI',
            description: `## Objective
Template browser UI — searchable gallery of templates shown during project creation or in a dedicated /templates page.

## Why it matters
Beautiful template showcasing drives adoption. Users who start from a template are 3x more likely to complete onboarding.

## Implementation Steps
1. Create /templates page — grid of template cards with category tabs
2. Template card: preview image, name, category, task count badge, "Preview" + "Use Template" buttons
3. Preview modal: shows epic/feature outline tree, task examples
4. "Use Template" on /projects/new — pre-selects template, auto-populates description
5. After IRIS completes → show template suggestion if matching niche detected
6. Filter by category: All, Marketplace, DevTool, Fintech, EdTech, SaaS Starter

## Affected Files
- src/app/templates/page.tsx (new)
- src/components/templates/template-card.tsx (new)
- src/components/templates/template-preview-modal.tsx (new)
- src/app/projects/new/page.tsx (integrate template selection)

## Expected Output
- Template gallery with category filter
- Preview modal shows template structure
- Template applies on project creation

## Edge Cases
- No templates for selected category
- Template load fails — show skeleton then error
- User switches template after partial selection

## Acceptance Criteria
- [ ] Templates page shows all 5 templates
- [ ] Category filter narrows results
- [ ] Preview modal shows epic/task tree
- [ ] "Use Template" integrates with new project flow

## QA Checklist
- Test each category tab
- Test preview modal content accuracy
- Verify template selection carries to project creation

## Handoff Notes
Preview images: use placeholder gradients with category icon until real screenshots exist.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 6,
          },
        ],
      },
      {
        title: 'Template Export & Import',
        description: 'Export any project as a reusable template. Import community templates. Share templates across workspaces.',
        tasks: [
          {
            title: 'Backend: Project-to-template export and template import API',
            description: `## Objective
Allow any project to be exported as a reusable template, and allow template JSON to be imported.

## Why it matters
Teams build expertise through iterations. Export lets them crystallize that expertise as templates for future projects.

## Implementation Steps
1. Create /api/projects/[id]/export-template route — POST: generates template JSON from project's epics/features/tasks, stripping IDs
2. Create /api/templates/import route — POST with JSON body: validates schema, creates template record
3. Template export: strip sensitive fields, normalize task descriptions, add metadata (source_project, exported_at)
4. Validate import schema before accepting (required: epics array, each with features, each with tasks)
5. Allow sharing templates with workspace (is_workspace_template) or publicly (is_public, pending admin approval)

## Affected Files
- src/app/api/projects/[id]/export-template/route.ts (new)
- src/app/api/templates/import/route.ts (new)
- src/lib/template-utils.ts (new — export/import logic)

## Expected Output
- Export creates valid template JSON
- Import creates template from JSON
- Shared templates visible to workspace

## Edge Cases
- Exporting empty project
- Import with duplicate slug — append suffix
- Malformed import JSON

## Acceptance Criteria
- [ ] Export produces valid template JSON
- [ ] Import from JSON creates template correctly
- [ ] Duplicate slugs handled
- [ ] Empty project export shows warning

## QA Checklist
- Export real project, reimport, verify task counts match
- Test malformed JSON import (expect 400)
- Test duplicate slug handling

## Handoff Notes
Use Zod schema validation for import. Strip: id, project_id, created_at, updated_at, assigned_to from export.`,
            task_type: 'code',
            priority: 'medium',
            assigned_to: 'backend_engineer',
            estimated_hours: 6,
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BATCH 11 — MARKETING ENGINE
  // ─────────────────────────────────────────────────────────────
  {
    title: 'Marketing Engine',
    description: 'AI-powered marketing content generator, landing page builder, and campaign manager. Locked: AI marketing generation.',
    order_index: 25,
    features: [
      {
        title: 'AI Marketing Content Generator',
        description: 'Use AI to generate landing page copy, email sequences, social posts, and ad copy based on project blueprint and target audience.',
        tasks: [
          {
            title: 'Backend: AI content generation API for marketing assets',
            description: `## Objective
API to generate marketing content (landing page copy, emails, social posts) using AI based on project context.

## Why it matters
Founders building with Build OS also need to market their product. Automating copy generation saves days of work.

## Implementation Steps
1. Create /api/marketing/generate route — POST with {project_id, content_type, tone, audience}
2. content_types: landing_hero, feature_bullets, email_welcome, email_onboarding, social_twitter, social_linkedin, ad_google, ad_meta
3. Pull project context from: project name, description, questionnaire answers, blueprint summary
4. Build prompt: "You are a conversion copywriter. Project: {context}. Generate {content_type} for {audience} in {tone} tone."
5. Stream response back via SSE (text/event-stream)
6. Store generated content in marketing_assets table (project_id, content_type, content, generated_at)

## Affected Files
- src/app/api/marketing/generate/route.ts (new)
- src/lib/marketing-ai.ts (new)
- supabase: marketing_assets table

## Expected Output
- Content generated per type
- Streamed response
- Assets stored for reuse

## Edge Cases
- No project blueprint yet — use basic project description
- AI generates off-topic content — add relevance validator
- Rate limiting per user

## Acceptance Criteria
- [ ] All 8 content types generate successfully
- [ ] Streaming works in browser
- [ ] Assets stored and retrievable
- [ ] Project context correctly injected into prompt

## QA Checklist
- Test each content type
- Verify streaming doesn't break on client disconnect
- Test with minimal project context (no blueprint)

## Handoff Notes
Use Anthropic Claude for generation (already installed). Context window limit: truncate project context at 2000 tokens.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 7,
          },
          {
            title: 'Frontend: Marketing content generator UI',
            description: `## Objective
Build the marketing content generator UI — a sidebar or page where users pick content type, tone, and audience then see AI-generated copy streamed in real-time.

## Why it matters
Great UX for content generation drives usage. Streamed output makes it feel fast and magical.

## Implementation Steps
1. Create /projects/[id]/marketing page
2. Left panel: content type selector (grouped: Pages, Emails, Social, Ads), tone dropdown (professional/casual/bold), audience input
3. Right panel: generated content viewer with streaming animation
4. "Generate" button → POST /api/marketing/generate, stream SSE response
5. Copy-to-clipboard button on each generated section
6. "Regenerate" button with optional prompt refinement
7. History tab: previous generated assets for this project

## Affected Files
- src/app/projects/[id]/marketing/page.tsx (new)
- src/components/marketing/content-generator.tsx (new)
- src/components/marketing/stream-viewer.tsx (new)

## Expected Output
- Content generator with streaming display
- Copy and regenerate buttons
- History of past generations

## Edge Cases
- Stream cut off mid-generation — show partial content + retry
- Very long generation — show loading indicator
- Clipboard API not available — fallback to manual select

## Acceptance Criteria
- [ ] All content types selectable
- [ ] Streaming text appears progressively
- [ ] Copy button works
- [ ] History tab shows previous assets

## QA Checklist
- Test streaming on slow connection
- Test all content types render
- Verify clipboard copy works on HTTPS

## Handoff Notes
SSE streaming: use ReadableStream + TextDecoder in fetch. Show cursor animation while streaming.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 7,
          },
        ],
      },
      {
        title: 'Landing Page Builder',
        description: 'Drag-and-drop landing page builder that uses AI-generated copy and outputs deployable HTML. Integrated with project blueprint.',
        tasks: [
          {
            title: 'Backend: Landing page storage and deploy API',
            description: `## Objective
Store landing page designs and deploy them as static HTML to a hosted URL.

## Why it matters
Build OS should produce not just code, but also the marketing website that accompanies every product.

## Implementation Steps
1. Create landing_pages table: (id, project_id, slug, html_content, sections JSONB, published_url, status)
2. Create /api/projects/[id]/landing-pages route — GET list, POST create, PATCH update
3. Create /api/projects/[id]/landing-pages/[page_id]/publish route — generates static HTML, deploys to Vercel as static site
4. Auto-generate initial landing page structure from AI: hero + features + CTA + footer using project context
5. Return public URL after publish

## Affected Files
- src/app/api/projects/[id]/landing-pages/route.ts (new)
- src/app/api/projects/[id]/landing-pages/[page_id]/publish/route.ts (new)
- supabase: landing_pages table

## Expected Output
- Landing page created and stored
- Publish generates accessible URL
- Auto-generation works from project context

## Edge Cases
- Slug collision — append project ID suffix
- Very large HTML — compress before storing
- Deploy fails — return error, don't mark as published

## Acceptance Criteria
- [ ] Landing page creation API works
- [ ] Publish returns accessible URL
- [ ] Auto-generation produces valid HTML
- [ ] Update/republish works

## QA Checklist
- Verify published URL loads in browser
- Test update + republish
- Verify slug uniqueness

## Handoff Notes
Static deploy: use Vercel Blob or similar for serving. Or generate GitHub Pages URL from connected repo.`,
            task_type: 'code',
            priority: 'medium',
            assigned_to: 'backend_engineer',
            estimated_hours: 7,
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BATCH 12 — AI LEARNING SYSTEM
  // ─────────────────────────────────────────────────────────────
  {
    title: 'AI Learning System',
    description: 'Automated learning engine that improves agent performance over time by analyzing patterns, tracking outcomes, and feeding intelligence back into task dispatch. Locked: auto learning.',
    order_index: 26,
    features: [
      {
        title: 'Auto Learning Engine',
        description: 'Continuously analyze completed tasks, agent outputs, and outcomes to extract learnings and improve future task generation and assignment.',
        tasks: [
          {
            title: 'Backend: Learning data collection and pattern extraction pipeline',
            description: `## Objective
Build the learning pipeline that collects outcome data from completed tasks and extracts reusable patterns for future improvement.

## Why it matters
Without learning, the system makes the same mistakes forever. With learning, each iteration improves agent accuracy, reduces cost, and increases success rate.

## Implementation Steps
1. Create learning_events table: (id, task_id, agent_type, outcome, duration_ms, retry_count, patterns JSONB, extracted_at)
2. After task completes (status=completed): auto-extract learning event via background job
3. Pattern extraction: compare task title/description keywords → outcome → build pattern score map
4. Create /api/learning/patterns route — GET top patterns per agent type
5. Create /api/learning/insights route — weekly insights: which agent improved, which degraded
6. Feed top patterns into task generation context (link to Memory & Knowledge Engine)

## Affected Files
- src/lib/learning-engine.ts (new)
- src/app/api/learning/patterns/route.ts (new)
- src/app/api/learning/insights/route.ts (new)
- supabase: learning_events table, pattern_library table

## Expected Output
- Learning events created for every completed task
- Patterns extracted and scored
- Insights API returns weekly summary

## Edge Cases
- Failed tasks — learn from failures too (record what not to do)
- Insufficient data (< 10 samples) — don't surface unreliable patterns
- Pattern conflict — same keyword, different outcomes → low confidence score

## Acceptance Criteria
- [ ] Learning event created per completed task
- [ ] Pattern extraction runs within 60s of completion
- [ ] Patterns API returns ranked results
- [ ] Insights API returns accurate weekly data

## QA Checklist
- Verify learning events appear after task completion
- Check pattern scores are reasonable
- Verify minimum sample threshold enforced

## Handoff Notes
Pattern extraction is async — run via /api/orchestrate/tick or dedicated cron. Don't block task completion flow.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 9,
          },
          {
            title: 'Frontend: Learning insights dashboard',
            description: `## Objective
Visual dashboard showing what the AI learning system has discovered — agent improvement trends, top patterns, success rate evolution.

## Why it matters
Founders need to see evidence that the system is actually learning. Visibility builds trust in the autonomous loop.

## Implementation Steps
1. Create /projects/[id]/learning page (or add to analytics)
2. Section 1: "Agent Performance Trends" — line chart per agent, success rate over 4 weeks
3. Section 2: "Top Patterns Discovered" — table of patterns with score, sample count, last seen
4. Section 3: "Weekly Insights" — text summary of what improved/degraded
5. Section 4: "Learning Events Log" — filterable table of learning events
6. Auto-refresh every 5min

## Affected Files
- src/app/projects/[id]/learning/page.tsx (new)
- src/components/learning/pattern-table.tsx (new)
- src/components/learning/agent-trend-chart.tsx (new)

## Expected Output
- Learning dashboard with trends and patterns

## Edge Cases
- No learning data yet — encouraging empty state "System is learning…"
- Single data point — don't draw trend line
- Very long pattern text — truncate with expand

## Acceptance Criteria
- [ ] Charts show agent performance over time
- [ ] Pattern table shows scored patterns
- [ ] Weekly insights text is human-readable
- [ ] Empty state is friendly

## QA Checklist
- Test with 0 learning events
- Test with 100+ learning events
- Verify chart renders correctly with 1 data point

## Handoff Notes
Use recharts LineChart for trends. Pattern scores: 0-100, color coded (green 70+, yellow 40-70, red <40).`,
            task_type: 'code',
            priority: 'medium',
            assigned_to: 'frontend_engineer',
            estimated_hours: 6,
          },
        ],
      },
      {
        title: 'Performance Feedback Loop',
        description: 'Close the loop: feed learning back into agent dispatch preferences, prompt selection, and task splitting decisions.',
        tasks: [
          {
            title: 'Backend: Feedback loop integration with dispatch and prompt selection',
            description: `## Objective
Use learned patterns to influence real-time dispatch decisions: which agent gets which task, which prompt version to use, when to auto-split.

## Why it matters
Learning data is worthless if it doesn't change behavior. The feedback loop is what makes the system actually improve.

## Implementation Steps
1. Extend task dispatch: before assigning agent, query top patterns for task type → boost agents with high success pattern scores
2. Integrate with Prompt Memory (Batch 5): select prompt version with highest quality_score for similar tasks
3. Auto-split decision: if task matches pattern that previously failed 3+ times without split → pre-emptively split
4. Create /api/learning/apply route — manually trigger pattern application to pending tasks
5. Store dispatch decisions with pattern_applied=true for learning audit

## Affected Files
- src/app/api/dispatch/task/route.ts (extend)
- src/lib/learning-engine.ts (extend with applyPatterns function)
- src/app/api/learning/apply/route.ts (new)

## Expected Output
- Dispatch influenced by learned patterns
- Pre-emptive splits on known-hard tasks
- Audit trail of pattern-influenced decisions

## Edge Cases
- Pattern confidence too low — ignore and use default dispatch
- Conflicting patterns — use highest confidence
- New task type with no patterns — use default

## Acceptance Criteria
- [ ] High-confidence patterns influence agent selection
- [ ] Pre-emptive split fires on known-hard tasks
- [ ] Pattern application logged in audit trail
- [ ] Low-confidence patterns don't override defaults

## QA Checklist
- Create pattern for task type → verify it influences next dispatch
- Test pre-emptive split threshold
- Verify audit trail entries

## Handoff Notes
Pattern confidence threshold for influence: 0.7 (70%). Below this, pattern is noted but not applied.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'backend_engineer',
            estimated_hours: 7,
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BATCH 16 — IRIS AI ARCHITECT
  // ─────────────────────────────────────────────────────────────
  {
    title: 'IRIS AI Architect',
    description: 'Replace the static onboarding wizard with IRIS — an AI conversational architect that gathers complete product understanding before any development starts. No form inputs allowed. IRIS decides when the project is ready to build.',
    order_index: 27,
    features: [
      {
        title: 'IRIS Conversation Engine',
        description: 'The backend brain of IRIS: conversation history storage, context building, adaptive question generation, completeness detection, and state machine.',
        tasks: [
          {
            title: 'Backend: IRIS conversation API with adaptive questioning and completeness detection',
            description: `## Objective
Build the IRIS conversation API at /api/projects/[id]/iris — handles messages, maintains context, detects completeness, and transitions to blueprint generation.

## Why it matters
This is the core of IRIS. Without a solid conversation engine, IRIS is just a chatbot. With it, IRIS becomes an architect that drives every project start.

## Implementation Steps
1. The route already exists at src/app/api/projects/[id]/iris/route.ts — ENHANCE it:
2. Add adaptive question logic: track which of 8 knowledge areas are covered, generate targeted follow-ups for gaps
3. Knowledge areas: Product Definition, Business Model, Feature Scope, Technical Stack, UX/Flow, Integrations, Scale Expectations, Constraints
4. Completeness score: 0-100 per area (based on answer specificity, not just presence)
5. When all areas score >= 70 → set iris_status='ready_for_build' on project
6. On completion → auto-trigger blueprint generation via POST /api/projects/[id]/blueprint
7. Store full conversation in iris_conversations table (project_id, messages JSONB, completeness_scores JSONB, status)
8. Add IRIS_SYSTEM_PROMPT: architect persona, never stop early, ask "why" for vague answers

## Affected Files
- src/app/api/projects/[id]/iris/route.ts (enhance existing)
- src/data/iris-prompts.ts (new — system prompt and question bank)
- supabase: iris_conversations table (project_id, messages JSONB, completeness_scores JSONB, status, completed_at)

## Expected Output
- IRIS asks adaptive questions per knowledge gap
- Completeness scores tracked per area
- Auto-transitions to blueprint on completion
- Conversation history persisted

## Edge Cases
- User gives one-word answers — IRIS probes deeper, never accepts
- User tries to rush completion — IRIS declines, explains what's still missing
- Long conversation (50+ messages) — maintain context window by summarizing older messages
- Project already has blueprint — skip to review mode

## Acceptance Criteria
- [ ] IRIS covers all 8 knowledge areas
- [ ] Completeness score per area calculated correctly
- [ ] Vague answers trigger follow-up questions
- [ ] iris_status set to ready_for_build when complete
- [ ] Blueprint auto-triggered on completion
- [ ] Conversation stored in DB

## QA Checklist
- Simulate complete onboarding with quality answers → verify all areas score >= 70
- Simulate vague answers → verify follow-ups generated
- Simulate premature completion attempt → verify IRIS declines
- Verify blueprint created after completion

## Handoff Notes
IRIS system prompt is critical. It must include: architect persona, 8 knowledge areas as checklist, instruction to never accept vague answers, instruction to propose options when user is unsure. See src/data/iris-prompts.ts.`,
            task_type: 'code',
            priority: 'critical',
            assigned_to: 'backend_engineer',
            estimated_hours: 12,
          },
          {
            title: 'Backend: IRIS state machine and blueprint auto-generation on completion',
            description: `## Objective
Implement IRIS state machine (gathering → probing → complete → building) and auto-trigger blueprint + task generation when IRIS marks project ready.

## Why it matters
IRIS completing is the trigger for the entire autonomous build process. If this transition is unreliable, nothing gets built.

## Implementation Steps
1. Define IRIS states: idle → gathering → probing_gaps → complete → generating_blueprint → ready_for_build
2. State persisted in iris_conversations.status
3. On complete → call blueprint generation (existing /api/projects/[id]/blueprint)
4. Blueprint generates: architecture plan, tech stack recommendation, feature breakdown
5. After blueprint → auto-seed epics/features/tasks using blueprint data
6. Update project.status = 'in_progress' and fire orchestration tick
7. Create /api/projects/[id]/iris/status route — GET current IRIS state + completeness scores per area

## Affected Files
- src/app/api/projects/[id]/iris/route.ts (extend)
- src/app/api/projects/[id]/iris/status/route.ts (new)
- src/app/api/projects/[id]/blueprint/route.ts (integrate)

## Expected Output
- State machine transitions correctly
- Blueprint auto-generated and stored
- Tasks seeded from blueprint
- Project enters in_progress state
- Orchestration tick fires

## Edge Cases
- Blueprint generation fails — set state back to complete with error, allow retry
- Task seeding produces 0 tasks — fallback to template
- User manually restarts IRIS after completion

## Acceptance Criteria
- [ ] State transitions are correct and logged
- [ ] Blueprint generated with all required sections
- [ ] Tasks seeded after blueprint
- [ ] Project moves to in_progress automatically
- [ ] Orchestration tick fires within 30s

## QA Checklist
- Full end-to-end: IRIS complete → blueprint → tasks → tick
- Test blueprint generation failure and retry
- Verify project status updates correctly

## Handoff Notes
Blueprint schema: {architecture: string, tech_stack: {}, features: [], epics_outline: []}. Store as JSON in project_blueprints table.`,
            task_type: 'code',
            priority: 'critical',
            assigned_to: 'backend_engineer',
            estimated_hours: 10,
          },
        ],
      },
      {
        title: 'IRIS Chat UI',
        description: 'The chat interface for IRIS — streaming AI responses, typing indicator, progress tracker showing how complete each knowledge area is, conversation history.',
        tasks: [
          {
            title: 'Frontend: IRIS chat UI with streaming, typing indicator, and progress tracker',
            description: `## Objective
Build the IRIS chat interface that replaces the static onboarding wizard. Full AI chat experience with streaming, progress tracking, and zero form inputs.

## Why it matters
The UI must make IRIS feel like a brilliant architect, not a chatbot. The experience quality directly impacts whether users trust IRIS enough to give quality answers.

## Implementation Steps
1. Remove/replace the existing static wizard in /projects/[id]/onboarding
2. New layout: left panel (60%) = chat; right panel (40%) = IRIS progress tracker
3. Chat panel: message bubbles (user = right/blue, IRIS = left/dark), streaming text animation, auto-scroll on new message
4. Typing indicator: animated 3-dot indicator when IRIS is generating
5. Right panel progress tracker: 8 knowledge areas as progress bars (0-100%), color: red → yellow → green as score increases
6. Input: single text input at bottom, disabled while IRIS is typing
7. Send on Enter or button click → POST /api/projects/[id]/iris → stream response via SSE
8. On IRIS completion → show "Blueprint Ready" banner, auto-redirect to project dashboard after 3s

## Affected Files
- src/app/projects/[id]/onboarding/page.tsx (replace existing with IRIS chat)
- src/components/iris/iris-chat.tsx (new)
- src/components/iris/iris-message.tsx (new)
- src/components/iris/iris-progress-panel.tsx (new)
- src/components/iris/iris-typing-indicator.tsx (new)

## Expected Output
- Full chat UI replacing static wizard
- Streaming responses render progressively
- Progress panel shows real-time completeness per area
- Completion triggers blueprint banner

## Edge Cases
- Network disconnect mid-stream — show partial + retry button
- Very long IRIS messages — proper scroll handling
- User pastes very long text — truncate or warn
- Mobile viewport — stack panels vertically

## Acceptance Criteria
- [ ] Static wizard completely replaced
- [ ] Streaming text renders correctly
- [ ] Typing indicator shows while IRIS generates
- [ ] All 8 knowledge areas shown in progress panel
- [ ] Completion banner fires and redirects
- [ ] Mobile layout works

## QA Checklist
- Test complete IRIS conversation end-to-end
- Test on mobile (iOS Safari, Android Chrome)
- Test network disconnect handling
- Verify streaming doesn't cause layout shifts

## Handoff Notes
Use ReadableStream with SSE. IRIS persona in UI: name "IRIS", avatar with geometric pattern. Background: dark/slate to contrast with chat bubbles. Remove ALL form inputs — chat only.`,
            task_type: 'code',
            priority: 'critical',
            assigned_to: 'frontend_engineer',
            estimated_hours: 12,
          },
          {
            title: 'Frontend: IRIS conversation history and resume flow',
            description: `## Objective
Allow users to resume an interrupted IRIS conversation and view the full conversation history before the project started building.

## Why it matters
IRIS conversations can take 15-30 minutes. Users need to be able to leave and resume without starting over.

## Implementation Steps
1. On /projects/[id]/onboarding load → check GET /api/projects/[id]/iris/status
2. If status = 'gathering' or 'probing_gaps' → load conversation history and resume from last message
3. Show previous messages in chat panel on resume
4. If status = 'complete' or 'ready_for_build' → show "IRIS session complete" summary with knowledge area scores
5. "Restart IRIS" button (with confirmation) — resets iris_conversations record
6. In project dashboard sidebar: show IRIS completeness summary card (8 areas with scores)

## Affected Files
- src/app/projects/[id]/onboarding/page.tsx (extend)
- src/components/iris/iris-summary-card.tsx (new)
- src/app/projects/[id]/dashboard or overview page (add summary card)

## Expected Output
- Interrupted conversations resume correctly
- Completed IRIS shows knowledge summary
- Restart flow works with confirmation

## Edge Cases
- Conversation history very long (50+ messages) — paginate or summarize
- Resume after browser close — full state restored
- Restart after blueprint generated — warn user (will require new blueprint)

## Acceptance Criteria
- [ ] Interrupted session resumes with history
- [ ] Completed state shows summary, not chat
- [ ] Restart clears history after confirmation
- [ ] Project dashboard shows IRIS summary

## QA Checklist
- Start conversation, close browser, reopen → verify resume
- Complete IRIS, refresh → verify summary shown
- Test restart flow

## Handoff Notes
Load last 50 messages from iris_conversations.messages JSONB. For longer histories, load last 30 + summary of first 20.`,
            task_type: 'code',
            priority: 'high',
            assigned_to: 'frontend_engineer',
            estimated_hours: 7,
          },
        ],
      },
      {
        title: 'IRIS QA & Validation',
        description: 'Validate IRIS collects all required data, never completes early, adapts questions correctly, and produces quality blueprints.',
        tasks: [
          {
            title: 'QA: IRIS completeness validation, adaptive questioning, and blueprint quality tests',
            description: `## Objective
Validate IRIS end-to-end: correct knowledge area coverage, refusal to complete early, adaptive follow-ups, and blueprint quality.

## Why it matters
IRIS is the critical quality gate before any code is written. If it completes with incomplete information, everything that follows is wrong.

## Implementation Steps
1. Write integration tests for /api/projects/[id]/iris route:
   - Test: submit all 8 knowledge areas with high-quality answers → verify completion
   - Test: submit vague answers → verify follow-up questions generated for each area
   - Test: try to force completion after 2 messages → verify refusal
   - Test: completeness scores calculated correctly (0-100 per area)
2. Test blueprint output quality:
   - Blueprint includes architecture plan
   - Blueprint includes tech stack breakdown
   - Blueprint includes feature list from IRIS conversation
3. Test streaming SSE response format
4. Test state transitions in state machine
5. Test conversation resume from saved history

## Affected Files
- tests/api/iris.test.ts (new)
- tests/integration/iris-flow.test.ts (new)

## Expected Output
- All IRIS paths tested and passing
- Blueprint quality validated

## Edge Cases
- All 8 areas given at once in first message — still ask follow-ups
- Blueprint generator fails — state machine handles correctly
- Empty message from user — IRIS prompts to continue

## Acceptance Criteria
- [ ] Complete with quality answers → completion achieved
- [ ] Vague answers → follow-ups generated for all affected areas
- [ ] Premature completion attempt → rejected by IRIS
- [ ] Blueprint contains all required sections
- [ ] State machine transitions tested

## QA Checklist
- Run test suite against staging
- Manual test with real conversation
- Verify blueprint JSON schema validity

## Handoff Notes
Use mocked Anthropic SDK for unit tests. Use real API for integration tests (staging env only, limited calls).`,
            task_type: 'test',
            priority: 'high',
            assigned_to: 'qa_security_auditor',
            estimated_hours: 8,
          },
        ],
      },
    ],
  },
]

export const BATCHES_6_16_SUMMARY = {
  total_epics: BATCHES_6_16.length,
  total_features: BATCHES_6_16.reduce((a, e) => a + e.features.length, 0),
  total_tasks: BATCHES_6_16.reduce((a, e) => a + e.features.reduce((b, f) => b + f.tasks.length, 0), 0),
}
