# Build OS — Web Application (Phase 3)

AI-native SaaS Development Operating System — Next.js 14 frontend, Supabase backend.

---

## Quick start

```bash
cd apps/web
cp .env.example .env.local   # fill in Supabase keys
npm install
npm run dev                  # http://localhost:3000
```

---

## Page map

| Route | File | Auth | Status |
|---|---|---|---|
| `/login` | `(auth)/login/page.tsx` | Public (redirects if authed) | ✅ Real |
| `/signup` | `(auth)/signup/page.tsx` | Public | ✅ Real |
| `/projects` | `(app)/projects/page.tsx` | Required | ✅ Real |
| `/projects/new` | `(app)/projects/new/page.tsx` | Required | ✅ Real |
| `/projects/[id]` | `(app)/projects/[id]/page.tsx` | Required | ✅ Real |
| `/projects/[id]/onboarding` | `(app)/projects/[id]/onboarding/page.tsx` | Required | ✅ Real |
| `/projects/[id]/tasks` | `(app)/projects/[id]/tasks/page.tsx` | Required | ✅ Real |
| `/projects/[id]/docs` | `(app)/projects/[id]/docs/page.tsx` | Required | 🟡 Shell (Phase 4: agent writes docs) |
| `/projects/[id]/integrations` | `(app)/projects/[id]/integrations/page.tsx` | Required | 🟡 Read-only (Phase 4: credential config) |
| `/projects/[id]/cost` | `(app)/projects/[id]/cost/page.tsx` | Required | 🟡 Estimates only (Phase 4: live events) |

---

## API endpoints

### Workspaces
| Method | Path | Description |
|---|---|---|
| GET | `/api/workspaces` | List workspaces for current user |
| POST | `/api/workspaces` | Create a workspace |

### Projects
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List all projects (with stats). Query: `?workspace_id=`, `?status=` |
| POST | `/api/projects` | Create project. Auto-creates environments + settings |
| GET | `/api/projects/[id]` | Full project with epics/features/tasks/blueprints |
| PATCH | `/api/projects/[id]` | Update project metadata |

### Questionnaire
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/[id]/questionnaire` | Get questionnaire + answers |
| POST | `/api/projects/[id]/questionnaire` | Upsert answers. Body: `{ answers: Record<string, string>, status }` |

### Blueprint
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/[id]/blueprint` | Get blueprint (latest version) with features + stack |
| POST | `/api/projects/[id]/blueprint` | Generate blueprint from questionnaire. Returns blueprint + execution plan + cost estimate |

### Tasks
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/[id]/tasks` | List all tasks. Query: `?status=`, `?epic_id=`, `?agent_role=` |
| POST | `/api/projects/[id]/tasks` | Seed from blueprint: `{ source: 'blueprint' }`. Manual: `{ feature_id, name, ... }` |

### Integrations
| Method | Path | Description |
|---|---|---|
| GET | `/api/integrations/providers` | List all providers, grouped by category. Query: `?category=` |

---

## Database tables touched (Phase 3)

**Reads:** `organizations`, `workspaces`, `projects`, `project_environments`, `project_settings`, `epics`, `features`, `tasks`, `task_runs`, `questionnaires`, `answers`, `blueprints`, `blueprint_features`, `blueprint_stack_recommendations`, `documents`, `integration_providers`, `project_integrations`, `cost_models`, `cost_events`, `cost_estimates`

**Writes:** `workspaces`, `projects`, `project_environments`, `project_settings`, `questionnaires`, `answers`, `blueprints`, `blueprint_features`, `blueprint_stack_recommendations`, `epics`, `features`, `tasks`

All writes go through API routes with RLS enforced via the user's Supabase JWT. No direct DB access from client components.

---

## Data flow — full vertical slice

```
User → /login
  → supabase.auth.signInWithPassword()
  → redirect /projects

/projects
  → Server component: supabase.from('projects').select(...)
  → Renders <ProjectCard /> grid with live data

/projects/new
  → Client form → POST /api/projects
  → API creates project + environments + settings
  → redirect /projects/[id]/onboarding

/projects/[id]/onboarding
  → <OnboardingWizard /> — 5-step client form
  → Step 1–4: local state only
  → Step 5 "Generate":
      1. POST /api/projects/[id]/questionnaire   → saves answers
      2. POST /api/projects/[id]/blueprint       → generateBlueprint() → DB
      3. POST /api/projects/[id]/tasks           → seeds epics/features/tasks
      4. redirect /projects/[id]

/projects/[id]   (Dashboard)
  → Server component: fetches project + epics + features + tasks
  → <ProjectDashboard /> — progress, stats, epic breakdown, risk flags

/projects/[id]/tasks
  → Server component: fetches flat task list with epic/feature context
  → <TaskBoard /> — board view (by status) + list view (by epic)
  → Filters: status, agent role

/projects/[id]/docs       → Shell — reads documents table
/projects/[id]/integrations → Read-only — providers + project_integrations
/projects/[id]/cost        → Estimates from tasks + cost_models (if present)
```

---

## Mocked vs real

| Feature | Phase 3 Status |
|---|---|
| Auth (login/signup) | ✅ Real — Supabase Auth |
| Workspace listing | ✅ Real — DB |
| Project CRUD | ✅ Real — DB with RLS |
| Onboarding wizard | ✅ Real — saves to questionnaires + answers |
| Blueprint generation | ✅ Real — deterministic template engine (no AI) |
| Execution plan seeding | ✅ Real — creates epics/features/tasks in DB |
| Task board | ✅ Real — reads DB, filter + view toggle |
| Progress tracking | ✅ Real — computed from task.status |
| Cost estimates | ✅ Real — computed from task.estimated_cost_usd |
| Documentation | 🟡 Shell — page exists, reads documents table |
| Integration credentials | 🟡 Read-only — no write UI |
| Live cost events | ❌ Not yet — activates in Phase 4 |
| Agent execution | ❌ Not yet — Phase 4 |
| n8n workflow triggers | ❌ Not yet — Phase 4 |
| Drag-drop task board | ❌ Not yet — Phase 5 (deferred) |

---

## Component architecture

```
src/
├── app/
│   ├── (auth)/                  # Public auth routes (no sidebar)
│   │   ├── layout.tsx           # Centered card layout
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (app)/                   # Protected app routes (sidebar)
│   │   ├── layout.tsx           # Auth guard + Sidebar
│   │   └── projects/
│   │       ├── page.tsx         # Project listing
│   │       ├── new/page.tsx     # Create project form
│   │       └── [id]/
│   │           ├── page.tsx     # Dashboard (server component)
│   │           ├── onboarding/  # 5-step wizard (client component)
│   │           ├── tasks/       # Task board (server → client)
│   │           ├── docs/        # Document shell
│   │           ├── integrations/# Provider listing
│   │           └── cost/        # Budget & cost view
│   ├── api/                     # API routes (all server-side, RLS enforced)
│   │   ├── workspaces/
│   │   ├── projects/
│   │   │   └── [id]/
│   │   │       ├── questionnaire/
│   │   │       ├── blueprint/
│   │   │       └── tasks/
│   │   └── integrations/providers/
│   ├── layout.tsx               # Root layout
│   └── globals.css
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx          # Nav sidebar with project context
│   │   └── TopBar.tsx           # Sticky header with title + actions
│   ├── ui/                      # Primitive components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx            # Input + Textarea + Select
│   │   ├── Badge.tsx            # Badge + StatusBadge + PriorityBadge
│   │   ├── ProgressBar.tsx
│   │   └── Spinner.tsx
│   ├── projects/
│   │   └── ProjectCard.tsx
│   ├── onboarding/
│   │   └── OnboardingWizard.tsx # 5-step wizard client component
│   ├── dashboard/
│   │   └── ProjectDashboard.tsx
│   └── tasks/
│       └── TaskBoard.tsx        # Board view + list view + filters
└── lib/
    ├── supabase/
    │   ├── client.ts            # Browser client (createBrowserClient)
    │   └── server.ts            # Server client + admin client + requireAuth
    ├── types.ts                 # Full DB types + composite types + API types
    ├── blueprint-generator.ts   # Deterministic blueprint + execution plan
    └── utils.ts                 # formatDate, formatUSD, TASK_STATUS_COLORS, cn, etc.
```

---

## Security model (enforced)

- All DB reads in server components use `createServerSupabaseClient()` — user JWT, RLS active
- All mutations go through `/api/*` routes — never direct from client
- `createAdminSupabaseClient()` (service_role) is only used server-side, never exposed to browser
- Middleware (`middleware.ts`) guards all non-auth routes — redirects unauthenticated users
- `credentials_safe_view` used for credential reads — never the base `credentials` table
- Route groups `(auth)` and `(app)` are layout-isolated

---

## Phase 4 — next steps

**Agent execution layer:**
- Wire n8n workflow triggers: `buildos_dispatch_task` webhook on task status → `ready`
- Implement `POST /api/dispatch/task` — checks idempotency, acquires resource lock, emits to n8n
- Build `POST /api/agent/output` — `ingest_agent_output` contract: validates schema, writes artifact, updates task status
- Implement `POST /api/qa/verdict` — `submit_qa_verdict` contract: syncs task status
- Build `POST /api/blockers` — `create_blocker` contract with duplicate detection

**Real-time features:**
- Supabase Realtime subscriptions on `tasks.status` for live board updates
- Toast notifications for task completions and blockers

**Cost live tracking:**
- `POST /api/cost/event` — `emit_cost_event` contract: validates + appends to cost_events ledger
- Live burn rate, forecast, and budget alerts on cost page

**Document generation:**
- Wire Documentation Engineer agent output → `documents` table
- Rich doc viewer with markdown rendering on `/docs` page

**Integration credentials:**
- Build secure credential creation UI using `createAdminSupabaseClient()` + envelope encryption
- Per-environment credential management with `integration_environment_credentials` table

**Release readiness:**
- Implement 10-gate release checklist on new `/release` page
- Wire Release Manager agent for automated gate assessment

**Drag-drop task board:**
- Implement optimistic status updates with Supabase Realtime sync
- Consider `@dnd-kit/core` for accessible drag-and-drop
