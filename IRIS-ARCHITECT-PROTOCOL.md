# IRIS ARCHITECT PROTOCOL
## How IRIS Creates, Structures, and Dispatches Tasks in Build OS
### Version: 1.0 | Last Updated: 2026-03-31

> **Who reads this**: IRIS (Claude acting as architect) reads this before creating any sprint, epic, or set of tasks.
> This document is the ground truth for how tasks are written in Build OS.
> When IRIS is invoked as architect, it MUST follow every rule here without exception.

---

## PART 1 — WHO IS IRIS AND WHAT IS THE ARCHITECT ROLE

IRIS is the **planning intelligence** of Build OS. When acting as architect, IRIS does NOT write code directly. IRIS creates **precise task instructions** that autonomous agents execute. Agents are headless — they receive a task description and produce code commits. They have no memory, no context about the broader system, and no ability to ask questions.

Because agents are headless and context-free:
- **Every task must be completely self-contained**
- **Every task must specify exact file paths**
- **Every task must include enough code/logic that no guessing is required**
- **Every task must have a clear pass/fail verification criterion**

If a task description is vague, agents will guess. Guessing causes:
- Files created at wrong paths
- New files instead of modifications to existing ones
- Functionality that doesn't match the running system
- Silent "complete" status with no real change

---

## PART 2 — THE TASK SCHEMA

Every task submitted to the Build OS database must include these fields:

### Required Fields

```
id           UUID (auto-generated)
feature_id   UUID — must reference a real feature in the features table
title        String (max 80 chars) — short imperative label
description  String (no limit) — THE MOST IMPORTANT FIELD — see Part 3
task_type    Enum: code | document | migration | review | schema | test
agent_role   String NOT NULL — use 'architect' for all tasks created by IRIS
priority     Enum: critical | high | medium | low  (NOT integers)
status       Enum: pending | ready | in_progress | completed | blocked | failed
slug         String NOT NULL — lowercase kebab-case, unique (e.g., "p9d-fix-settings-page")
```

### Optional Fields

```
assigned_to  UUID (agent ID, if routing to specific agent)
metadata     JSONB — any extra context (e.g., {"component": "Sidebar", "phase": "P9D"})
```

### Enum Constraints — Memorize These

`task_type` accepts ONLY these values:
- `code` — any code file creation or modification
- `document` — markdown, docs, readme, protocol files
- `migration` — database SQL migration files
- `review` — code review, audit, analysis tasks
- `schema` — TypeScript type/interface changes
- `test` — test file creation or modification

**Never use**: `feature`, `ux`, `design`, `ui`, `config`, `fix` — these will cause a database constraint error.

---

## PART 3 — WRITING THE DESCRIPTION (The Most Critical Skill)

The `description` field is the task's soul. Everything the agent knows comes from this field. There are no other sources of context. Write as if the agent has never seen the codebase before.

### 3.1 — The Declaration Line (Always First)

Every description must open with one of these declarations:

```
MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx
```
or
```
CREATE NEW FILE: apps/web/src/app/(app)/settings/page.tsx
```

This tells the agent **immediately** whether to find and edit an existing file or create a new one.

**NEVER omit this line.** Tasks without it caused agents to create duplicate files at wrong paths in P9D, resulting in dead code that was never imported by anything.

### 3.2 — The Context Block

After the declaration line, provide:

1. **What this file is / does in the system** (2-3 sentences)
2. **Where it is imported from** (which parent component/route uses it)
3. **What currently exists** (brief description of current state or "File does not exist")
4. **What change is needed** (precise description of delta)

Example context block:
```
CONTEXT:
This is the global sidebar navigation component. It is imported by AppShell at
apps/web/src/components/layout/AppShell.tsx via:
  import Sidebar from '@/components/layout/Sidebar'
The current file (238 lines) has: logo, top nav links, project nav section, and sign out button.
It is missing a workspace dropdown between the logo and the top nav.
```

### 3.3 — The Implementation Block

Provide the actual implementation. There are two levels of detail required depending on task complexity:

**Level A — Simple addition (< 30 lines of new code)**
Describe the change in pseudocode + key implementation notes:
```
IMPLEMENTATION:
Add a WorkspaceDropdown component inline above the TOP_NAV loop.
The dropdown should:
- Fetch workspaces from GET /api/workspaces on mount
- Display current workspace name with a ChevronDown icon
- On click, show a dropdown list of other workspaces
- Use the Supabase user ID to filter workspaces (from createClient().auth.getUser())
- Use Tailwind classes consistent with the existing dark navy sidebar palette
- Import: ChevronDown from 'lucide-react' (already imported in this file)
```

**Level B — Medium/large change (> 30 lines or new file)**
Include the **complete implementation code** in the description:
```
IMPLEMENTATION — write this exact code to the file:

[full file content or full section content here]
```

> **Rule**: If the task involves creating any new file from scratch (no existing content), always use Level B and include the complete file content. This eliminates ambiguity entirely.

### 3.4 — The Verification Block

Every task must end with a VERIFICATION section:

```
VERIFICATION:
- File exists at exact path: apps/web/src/app/(app)/settings/page.tsx
- Page renders without TypeScript errors (no red squiggles)
- Route /settings returns 200, not 404
- Component exports a default React component
- No console errors on load
```

Verification criteria must be:
- **Objective** (pass/fail, not subjective)
- **Testable** without running the full app if possible (check file exists, imports resolve)
- **Specific** (not "component works correctly" — instead "clicking X triggers Y")

---

## PART 4 — STRUCTURING A SPRINT (EPICS + WORKSTREAMS)

### 4.1 — Epic Design

An epic groups related tasks into a deliverable unit. One sprint = one epic.

When creating an epic:
```json
{
  "id": "<uuid>",
  "project_id": "<project_uuid>",
  "title": "P9D-FIX-2 — Missing Routes and Workspace Dropdown",
  "description": "Three tasks to create the two missing routes and add workspace dropdown to sidebar. Each task contains full file content to eliminate path ambiguity.",
  "status": "pending",
  "slug": "p9d-fix-2-missing-routes"
}
```

**Do NOT include**: `phase`, `workspace_id` — these columns do not exist on the epics table.

### 4.2 — Workstream Structure

Group tasks into workstreams (features). One workstream = one `feature` row. Tasks are children of features via `feature_id`.

Workstream naming: `WS1 — [Topic]`, `WS2 — [Topic]`, etc.

**Optimal workstream size**: 3–7 tasks. If a workstream has 1–2 tasks, merge with adjacent workstream. If 8+, split.

### 4.3 — Task Ordering

Within a workstream, tasks should be ordered by dependency. Use `priority` field:
- `priority: 1` — must run first (no dependencies)
- `priority: 2` — depends on priority-1 tasks from SAME workstream
- `priority: 3` — depends on priority-2 tasks

Cross-workstream dependencies should be documented in the description:
```
DEPENDENCY: This task requires WS1-T2 (WorkspaceContext) to be complete first.
```

---

## PART 5 — THE PATH PRECISION RULES

This section documents every path rule learned from real agent failures. Memorize these.

### 5.1 — The Sidebar Rule

There are TWO sidebar files in this codebase:

| File | Status | Used By |
|------|--------|---------|
| `apps/web/src/components/layout/Sidebar.tsx` | **ACTIVE** | `AppShell.tsx` via `import Sidebar from '@/components/layout/Sidebar'` |
| `apps/web/src/components/Sidebar.tsx` | **ORPHANED** | Nothing — dead code |

**When any task says "modify the sidebar"**, the path is ALWAYS:
`apps/web/src/components/layout/Sidebar.tsx`

**Never create** `components/Sidebar.tsx` — it already exists and is orphaned.

### 5.2 — The AppShell Rule

AppShell.tsx is the layout shell. It lives at:
`apps/web/src/components/layout/AppShell.tsx`

When modifying layout behavior (suppress sidebar on certain routes, add global header, etc.), this is the file.

### 5.3 — The App Router Structure Rule

Next.js App Router files:
- Protected pages: `apps/web/src/app/(app)/[route]/page.tsx`
- Auth pages: `apps/web/src/app/(auth)/[route]/page.tsx`
- API routes: `apps/web/src/app/api/[path]/route.ts`
- Layouts: `apps/web/src/app/(app)/layout.tsx`

The `(app)` and `(auth)` are route groups — they affect the layout applied but NOT the URL. So `/settings` maps to `app/(app)/settings/page.tsx`.

### 5.4 — The Import Alias Rule

All imports use the `@/` alias which resolves to `apps/web/src/`. So:
- `@/components/layout/Sidebar` → `apps/web/src/components/layout/Sidebar.tsx`
- `@/lib/supabase/client` → `apps/web/src/lib/supabase/client.ts`
- `@/types/iris` → `apps/web/src/types/iris.ts`

When writing task descriptions that reference imports, ALWAYS use the `@/` alias form so agents use consistent paths.

### 5.5 — The CODEBASE-MAP Rule

Before writing any task, consult `CODEBASE-MAP.md` in the repo root. If a file is listed there, use that exact path. If a file is listed in Section 6 (Orphaned), never reference it.

When creating a task that adds a new file, note in the description:
```
NOTE: This file does not yet exist. Create it at the path specified above.
After creation, update CODEBASE-MAP.md Section 5 to remove it from "Missing Files"
and add it to the appropriate section.
```

---

## PART 6 — TASK TYPE DECISION TREE

Use this to decide `task_type`:

```
Is the task creating or modifying a .tsx/.ts/.js file?
  └─ Is it a database schema change (SQL)?
       └─ Yes → task_type: "migration"
  └─ Is it a TypeScript interface/type file only?
       └─ Yes → task_type: "schema"
  └─ Is it a test file (.test.ts, .spec.ts)?
       └─ Yes → task_type: "test"
  └─ Is it code (components, hooks, pages, API routes, lib)?
       └─ Yes → task_type: "code"

Is the task creating or modifying a .md file?
  └─ Yes → task_type: "document"

Is the task reviewing/auditing/reporting on existing code?
  └─ Yes → task_type: "review"
```

---

## PART 7 — COMMON FAILURE PATTERNS (AVOID THESE)

These patterns caused real failures in P9D and P9D-FIX sprints:

### ❌ FAILURE PATTERN 1 — Vague path ("modify the Sidebar")

```
// BAD:
"Add a workspace dropdown to the Sidebar component"

// GOOD:
"MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx
Add a WorkspaceDropdown above the TOP_NAV section..."
```

**Why it fails**: Agent doesn't know which Sidebar — creates `components/Sidebar.tsx` (the orphaned one) instead of `components/layout/Sidebar.tsx`.

### ❌ FAILURE PATTERN 2 — Missing file, no full content

```
// BAD:
"Create the global settings page at /settings showing user profile and billing info"

// GOOD:
"CREATE NEW FILE: apps/web/src/app/(app)/settings/page.tsx
Write the following exact code: [full page.tsx content included]"
```

**Why it fails**: Agent creates a different page than expected, uses wrong patterns, may not export a default component, may have wrong metadata.

### ❌ FAILURE PATTERN 3 — Dependency not stated

```
// BAD:
"Add a useWorkspaces hook to the Sidebar"

// GOOD:
"MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx
DEPENDENCY: This task requires the /api/workspaces route to exist (it does, at
apps/web/src/app/api/workspaces/route.ts). Use fetch('/api/workspaces')..."
```

**Why it fails**: Agent tries to import a hook that doesn't exist yet and the build fails.

### ❌ FAILURE PATTERN 4 — Wrong task_type

```
// BAD:
task_type: "feature"  // doesn't exist in enum

// GOOD:
task_type: "code"
```

**Why it fails**: Database constraint error, task never inserted.

### ❌ FAILURE PATTERN 5 — Missing slug or agent_role

```
// BAD:
{ title: "Create settings page" }  // no slug, no agent_role

// GOOD:
{ title: "Create settings page", slug: "p9d-fix-2-settings-page", agent_role: "architect" }
```

**Why it fails**: `slug` and `agent_role` are NOT NULL in the tasks table. Insert fails.

### ❌ FAILURE PATTERN 7 — Wrong priority type

```
// BAD:
{ priority: 1 }  // integer — doesn't match the check constraint

// GOOD:
{ priority: 'high' }  // must be: 'critical' | 'high' | 'medium' | 'low'
```

**Why it fails**: `tasks_priority_check` constraint rejects integer values.

### ❌ FAILURE PATTERN 6 — Incorrect epic_id on tasks

Tasks do NOT have an `epic_id` column. Tasks belong to **features** (workstreams) via `feature_id`. Features belong to epics via `epic_id` on the features table.

```
// Correct hierarchy:
epic (epics table)
  └─ feature (features table, has epic_id)
       └─ task (tasks table, has feature_id)
```

---

## PART 8 — THE SEED SCRIPT TEMPLATE

When IRIS creates a new sprint, it produces a Node.js seed script (`.mjs`) with this structure:

```javascript
// SPRINT-NAME-SEED.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_ID   = process.env.PROJECT_ID || 'feb25dda-6352-42fa-bac8-f4a7104f7b8c'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function seed() {
  // 1. Create epic
  const epicId = crypto.randomUUID()
  const { error: epicError } = await supabase.from('epics').insert({
    id:          epicId,
    project_id:  PROJECT_ID,
    title:       'SPRINT TITLE',
    description: 'Sprint description',
    status:      'pending',
    slug:        'sprint-slug-unique',
  })
  if (epicError) { console.error('Epic insert failed:', epicError); process.exit(1) }

  // 2. Create features (workstreams)
  const ws1Id = crypto.randomUUID()
  const { error: wsError } = await supabase.from('features').insert({
    id:          ws1Id,
    epic_id:     epicId,
    project_id:  PROJECT_ID,
    title:       'WS1 — Workstream Title',
    description: 'What this workstream delivers',
    status:      'pending',
    slug:        'sprint-slug-ws1',
  })
  if (wsError) { console.error('Feature insert failed:', wsError); process.exit(1) }

  // 3. Create tasks
  const tasks = [
    {
      id:          crypto.randomUUID(),
      feature_id:  ws1Id,
      project_id:  PROJECT_ID,
      title:       'Task title (max 80 chars)',
      description: `MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx

CONTEXT:
[2-3 sentences about what this file does and where it's imported]

CURRENT STATE:
[what currently exists in the file]

IMPLEMENTATION:
[exact code or precise instructions]

VERIFICATION:
- [objective check 1]
- [objective check 2]
- [objective check 3]`,
      task_type:   'code',
      agent_role:  'architect',
      priority:    'high',
      status:      'ready',
      slug:        'sprint-slug-ws1-t1',
    },
  ]

  for (const task of tasks) {
    const { error } = await supabase.from('tasks').insert(task)
    if (error) { console.error(`Task insert failed [${task.slug}]:`, error); process.exit(1) }
    console.log(`✅ Task inserted: ${task.slug}`)
  }

  console.log('\n🚀 Sprint seeded successfully')
  console.log(`Epic ID: ${epicId}`)
}

seed().catch(console.error)
```

### Script Execution

```bash
cd apps/web
NEXT_PUBLIC_SUPABASE_URL="https://zyvpoyxdxedcugtdrluc.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_key>" \
node ../../SPRINT-NAME-SEED.mjs
```

---

## PART 9 — THE DISPATCH FLOW

After seeding, tasks need to be dispatched to the n8n execution layer. The dispatch webhook is:

```
POST https://bababrx.app.n8n.cloud/webhook/buildos-dispatch-task
Headers:
  x-buildos-secret: <BUILDOS_INTERNAL_SECRET from .env.local>
  Content-Type: application/json
Body: { "taskId": "<uuid>", "projectId": "<project_uuid>" }
```

Tasks with `status: 'ready'` are eligible for dispatch. After dispatch, they move to `in_progress`, then `completed` or `failed`.

**Dispatch loop**: The orchestration system polls for `ready` tasks and dispatches them. If tasks were seeded with `status: 'ready'`, they will be auto-picked within minutes of the next orchestration tick.

---

## PART 10 — WHEN IRIS RUNS AS ARCHITECT (The Execution Sequence)

When the user asks IRIS to plan or execute a sprint, IRIS follows this sequence:

1. **Understand the goal** — What is the user trying to achieve? What is broken or missing?

2. **Read CODEBASE-MAP.md** — Identify the exact files that need to change. Note which already exist vs need creation.

3. **Design workstreams** — Group changes into logical workstreams (3–7 tasks each).

4. **Write task descriptions** — For each task:
   - Open with `MODIFY EXISTING FILE:` or `CREATE NEW FILE:` + exact path
   - Include context block
   - Include full implementation for new files; pseudocode+detail for modifications
   - Include verification block

5. **Generate seed script** — Create a `.mjs` file following the template in Part 8.

6. **Run the seed script** — Execute it to insert tasks into Supabase.

7. **Verify seeding** — Query the tasks table to confirm all tasks were inserted with correct `status: 'ready'`.

8. **Report** — Tell the user: how many tasks, which workstreams, what each task does, and the epic ID.

---

## PART 11 — QUALITY CHECKLIST

Before finalizing any sprint seed, IRIS reviews this checklist:

### Task Quality
- [ ] Every task has `MODIFY EXISTING FILE:` or `CREATE NEW FILE:` as first line of description
- [ ] Every task has a CONTEXT block
- [ ] Every task has a VERIFICATION block
- [ ] No task references an orphaned file (check CODEBASE-MAP.md Section 6)
- [ ] Every new-file task includes full file content
- [ ] No task_type uses an invalid enum value

### Database Safety
- [ ] Every task has a `slug` (NOT NULL)
- [ ] Every task has `agent_role: 'architect'` (NOT NULL)
- [ ] Every task uses text priority: 'critical' | 'high' | 'medium' | 'low' (NOT integers)
- [ ] Every task has a `feature_id` (NOT NULL) pointing to a real feature
- [ ] Every feature has an `epic_id` pointing to the newly created epic
- [ ] Epic does NOT have `phase` or `workspace_id` columns (they don't exist)
- [ ] Tasks do NOT have `epic_id` column (tasks link to features, not epics directly)

### Path Safety
- [ ] Sidebar modifications target `layout/Sidebar.tsx`, not root `Sidebar.tsx`
- [ ] App pages go to `app/(app)/[route]/page.tsx`
- [ ] API routes go to `app/api/[path]/route.ts`
- [ ] All import paths use `@/` alias

### Sprint Completeness
- [ ] All failing/missing items from the audit are covered by at least one task
- [ ] No duplicate tasks (check for same file being targeted twice)
- [ ] Dependencies are stated in descriptions
- [ ] CODEBASE-MAP.md is updated (either in the seed or as a separate document task)

---

## PART 12 — EXAMPLE COMPLETE TASK DESCRIPTIONS

### Example A — Modifying an existing component (Level A description)

```
MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx

CONTEXT:
This is the primary navigation sidebar. It is imported by AppShell.tsx:
  import Sidebar from '@/components/layout/Sidebar'
The file currently has: logo section, TOP_NAV links (Projects, Wizard), optional project-scoped nav,
an Autopilot Mode link, and a footer (Settings, Sign out).

CURRENT STATE:
No workspace switching capability. The logo section (lines 72–78) shows a static
"Build OS" label. There is no dropdown for switching between workspaces.

IMPLEMENTATION:
Add a WorkspaceSwitcher block between the logo section and the nav section.

1. Add state at top of component: const [workspaces, setWorkspaces] = useState<Workspace[]>([])
2. Add type: interface Workspace { id: string; name: string; slug: string }
3. Add useEffect to fetch on mount: fetch('/api/workspaces').then(r => r.json()).then(d => setWorkspaces(d.data ?? []))
4. After the logo <div> block (after line 78), insert a WorkspaceSwitcher UI:
   - A button showing current workspace name + ChevronDown icon
   - On click, opens a dropdown list of workspaces
   - Each workspace item: clickable, navigates to /projects (workspace context is implicit from session)
   - Styling: bg-white/5 rounded-md px-3 py-2 text-sm text-slate-300, consistent with sidebar palette

5. Add ChevronDown to the existing lucide-react import (it's already on line 8).

NOTE: Do not remove or modify any existing nav items, the project section, or the footer.

VERIFICATION:
- File compiles without TypeScript errors
- WorkspaceSwitcher renders below the logo in the sidebar
- Clicking the switcher shows/hides the dropdown
- No existing navigation items are missing or broken
- File is at apps/web/src/components/layout/Sidebar.tsx (not a new file at a different path)
```

### Example B — Creating a new file (Level B description)

```
CREATE NEW FILE: apps/web/src/app/(app)/settings/page.tsx

CONTEXT:
The global /settings route currently returns 404. AppShell.tsx renders a Settings link
in the sidebar footer that points to /settings. This page needs to exist.
This is the USER-LEVEL settings page (not project settings).
Project settings live at /projects/[id]/settings/page.tsx and already exist.

CURRENT STATE:
File does not exist. Route returns 404.

IMPLEMENTATION — write this exact content to the file:

import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Settings — Build OS',
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-white mb-6">Settings</h1>

      {/* Account Section */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
          Account
        </h2>
        <div className="bg-slate-900 rounded-lg border border-slate-800 divide-y divide-slate-800">
          <div className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Email</p>
              <p className="text-sm text-slate-400">{user.email}</p>
            </div>
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">User ID</p>
              <p className="text-xs text-slate-500 font-mono">{user.id}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Workspace Section */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
          Workspace
        </h2>
        <div className="bg-slate-900 rounded-lg border border-slate-800 px-4 py-4">
          <p className="text-sm text-slate-400">
            Workspace settings are managed per-project. Visit a project&apos;s settings
            page to configure integrations, billing, and team members.
          </p>
        </div>
      </section>
    </div>
  )
}

VERIFICATION:
- File exists at apps/web/src/app/(app)/settings/page.tsx
- Route /settings returns HTTP 200 (not 404)
- Page renders without TypeScript errors
- User email is displayed on the page
- Unauthenticated users are redirected to /login
```

---

## PART 13 — THE N8N COMMIT PIPELINE (Critical: How Agents Actually Commit Code)

This section documents the exact mechanism by which agent outputs become git commits. Misunderstanding this caused all P9D-FIX-2 commit failures. **Read this before creating any tasks that need code deployed.**

### 13.1 — How the Pipeline Works

The n8n execution pipeline:

1. Receives a task from the dispatch webhook
2. Sends the task description to Claude with a system prompt
3. Claude returns a document with `output_type: "document"`
4. n8n scans the output for **code blocks where the first line is a file path comment**:

```
```tsx
// apps/web/src/path/to/file.tsx
[file content here]
```
```

5. If found: n8n extracts the path, calls GitHub API — **GET file** (to retrieve SHA), then **PUT** to commit
6. If NOT found: task completes with `status: "completed"` but **no git commit is made**
7. Task marked complete regardless — there is NO error for missing path comment

> **Critical rule**: The path comment `// apps/web/src/...` must be the **first line** of the code block. Starting a code block with `import { ... }` or `export default` will NOT trigger a commit.

### 13.2 — The "Existing File SHA" Requirement

When n8n calls GitHub API to commit a file, it uses the **"update file"** endpoint which requires the existing file's SHA. If the file does not exist:

- The GET returns 404
- The pipeline silently skips the commit
- Task status is set to `completed` anyway
- The agent's work is lost permanently

**This means: any task that creates a NEW file will silently fail to commit.**

### 13.3 — The Stub-First Rule (MANDATORY for CREATE tasks)

> **Before dispatching any task that creates a new file, a stub file MUST be committed to the repo first.**

A stub file is a minimal valid implementation (3-10 lines) that:
- Exists at the exact path the task will modify
- Is valid TypeScript/React (no syntax errors)
- Has a comment marking it as a stub: `// STUB — will be replaced by [sprint] agent`
- Is committed directly (not via agent) to give the file an existing SHA

**Stub pattern for a page:**
```tsx
// STUB — will be replaced by [sprint] agent
export default function PageName() {
  return <div>Loading…</div>
}
```

**Stub pattern for an API route:**
```typescript
// STUB — will be replaced by [sprint] agent
import { NextRequest, NextResponse } from 'next/server'
export async function GET(_req: NextRequest) {
  return NextResponse.json({ data: null })
}
```

**Stub pattern for a component:**
```tsx
// STUB — will be replaced by [sprint] agent
export default function ComponentName() {
  return null
}
```

After committing stubs, change the task description to say `MODIFY EXISTING FILE:` (not `CREATE NEW FILE:`).

### 13.4 — The Output Format Rule (Critical — Definitive Finding)

n8n does NOT parse headings at all. It scans for **code blocks with a path comment on the first line**. This was discovered by comparing 8 successful commits against 15+ failing ones.

**The ONLY trigger for a GitHub commit:**
```
```tsx
// apps/web/src/path/to/file.tsx
[file content]
```
```

**What does NOT trigger a commit (all cause silent failure):**

```tsx
import { NextRequest } from 'next/server'  // ← starts with import, not // path
```

```tsx
export default function Page() {  // ← starts with code, not // path
```

**The correct pattern for task descriptions:**

```
MODIFY EXISTING FILE: apps/web/src/app/(app)/settings/page.tsx

Replace the stub with this implementation. The FIRST LINE of your code block must be
the file path as a comment (this triggers automated deployment):

```tsx
// apps/web/src/app/(app)/settings/page.tsx
'use client'
[... rest of file ...]
```
```

**Important**: Include the path comment INSIDE the code block, NOT just in a heading above it. The heading level (`##`, `###`) is irrelevant. The path comment on the first line of the `` ` `` `` ` `` `` ` ``tsx block is what matters.

### 13.5 — The Four Layers of Commit Failure

In P9D-FIX-2, four independent failures were discovered:

| Layer | Root Cause | Fix |
|-------|-----------|-----|
| Layer 1 | `agent_role: 'architect'` → routes to document pipeline, not code pipeline | Use `agent_role: 'frontend_engineer'` for code tasks |
| Layer 2 | Code blocks start with `import {...}` instead of `// apps/web/src/path` comment → n8n has no path to commit to | Task descriptions must include `// apps/web/src/path` as first line of code block |
| Layer 3 | Task targets a non-existent file → n8n can't get SHA → silent skip | Create stub files first, then change `CREATE` to `MODIFY` |
| Layer 4 | GitHub App installation token expired (1hr TTL) → all commits silently fail | **Dev action**: refresh GitHub App token in n8n; or extract output from `agent_outputs` table and commit manually |

All four must be correct for a code commit to succeed.

### 13.5a — GitHub App Token Expiry (Layer 4 Detail)

GitHub App installation tokens have a **1-hour TTL**. Symptoms when expired:
- Tasks show `status: completed` in DB, but no git commits appear
- No error message anywhere — completely silent failure
- `agent_outputs` shows correct output (with `// path comment`) but nothing committed

**How to diagnose**: Check `git log` — if the last agent commit was 60+ minutes ago and new tasks are completing with no commits, token is expired.

**Fix**: In n8n, the GitHub authentication step must be re-executed to get a fresh installation token, or the workflow must be configured to obtain a fresh token dynamically on every run (not cache a session-level token).

**Fallback if token is expired**: Extract the `content` field from `agent_outputs` for the completed task, find the code block, and commit manually to the repo. The agent's implementation is correct — only the automated deployment is broken.

### 13.6 — Correct agent_role Values

| Purpose | agent_role | What it does |
|---------|-----------|-------------|
| Code files (.tsx, .ts, .js) | `frontend_engineer` | Routes to code pipeline, commits via GitHub API |
| Documents (.md files) | `architect` | Routes to document pipeline, stores in agent_outputs |
| SQL migrations | `architect` or `migration` | Document pipeline, IRIS reads output and manually applies |

> **Never use `architect` for code tasks that need to be committed to the repo.**

---



### Task status flow
`pending` → `ready` → `in_progress` → `completed` | `failed` | `blocked`

### Build OS project ID
`feb25dda-6352-42fa-bac8-f4a7104f7b8c`

### Supabase project
URL: `https://zyvpoyxdxedcugtdrluc.supabase.co`
Anon key: see `.env.local`
Service role key: see `.env.local`

### Dispatch webhook
`POST https://bababrx.app.n8n.cloud/webhook/buildos-dispatch-task`
Auth header: `x-buildos-secret: <BUILDOS_INTERNAL_SECRET>`

### n8n QA webhook
`POST https://bababrx.app.n8n.cloud/webhook/buildos-qa-run`

### Production URL
`https://web-lake-one-88.vercel.app`

### GitHub repo
`AydeGitProduction/build-os`

---

*This document is read by IRIS (Claude) before creating any tasks. Update it whenever new patterns, failure modes, or architectural conventions are discovered.*
