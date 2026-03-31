# CODEBASE-MAP.md
## Build OS — Active File Registry
### Last updated: 2026-03-31 | Maintained by: IRIS Architect

> **For AI agents executing tasks**: Before creating or modifying any file, look up the correct path here.
> If a file is listed below, **MODIFY IT** — do NOT create a duplicate.
> If you need to create a new file, add it to this map in the same commit.

---

## ⚠️ CRITICAL RULES FOR AGENTS

1. **NEVER create a file if one already exists at a similar path.** Check this map first.
2. **`components/layout/Sidebar.tsx` is the ACTIVE sidebar** — NOT `components/Sidebar.tsx` (orphaned).
3. **`components/layout/AppShell.tsx` is the ACTIVE shell** — it imports from `@/components/layout/Sidebar`.
4. **All imports use `@/` alias** which maps to `apps/web/src/`.
5. **App Router paths**: pages are at `app/(app)/...` (protected) or `app/(auth)/...` (public).
6. **When task says "Sidebar"** → file is `apps/web/src/components/layout/Sidebar.tsx`.
7. **When task says "IrisWorkspace"** → file is `apps/web/src/components/iris/IrisWorkspace.tsx`.
8. **When task says "AppShell"** → file is `apps/web/src/components/layout/AppShell.tsx`.

---

## SECTION 1 — ROUTES (page.tsx files)

| Route URL | File Path | Notes |
|-----------|-----------|-------|
| `/login` | `apps/web/src/app/(auth)/login/page.tsx` | Auth — public |
| `/signup` | `apps/web/src/app/(auth)/signup/page.tsx` | Auth — public |
| `/projects` | `apps/web/src/app/(app)/projects/page.tsx` | Projects list |
| `/projects/new` | `apps/web/src/app/(app)/projects/new/page.tsx` | Create project |
| `/projects/[id]` | `apps/web/src/app/(app)/projects/[id]/page.tsx` | Command Center |
| `/projects/[id]/tasks` | `apps/web/src/app/(app)/projects/[id]/tasks/page.tsx` | Task board |
| `/projects/[id]/agents` | `apps/web/src/app/(app)/projects/[id]/agents/page.tsx` | Agent roster |
| `/projects/[id]/agents/[agent]` | `apps/web/src/app/(app)/projects/[id]/agents/[agent]/page.tsx` | Agent detail |
| `/projects/[id]/autopilot` | `apps/web/src/app/(app)/projects/[id]/autopilot/page.tsx` | IRIS/Power Wizard |
| `/projects/[id]/system` | `apps/web/src/app/(app)/projects/[id]/system/page.tsx` | System health |
| `/projects/[id]/preview` | `apps/web/src/app/(app)/projects/[id]/preview/page.tsx` | Live preview |
| `/projects/[id]/release` | `apps/web/src/app/(app)/projects/[id]/release/page.tsx` | Release mgmt |
| `/projects/[id]/cost` | `apps/web/src/app/(app)/projects/[id]/cost/page.tsx` | Cost dashboard |
| `/projects/[id]/orchestrate` | `apps/web/src/app/(app)/projects/[id]/orchestrate/page.tsx` | Orchestration |
| `/projects/[id]/docs` | `apps/web/src/app/(app)/projects/[id]/docs/page.tsx` | Docs viewer |
| `/projects/[id]/integrations` | `apps/web/src/app/(app)/projects/[id]/integrations/page.tsx` | Integrations |
| `/projects/[id]/settings` | `apps/web/src/app/(app)/projects/[id]/settings/page.tsx` | Project settings |
| `/projects/[id]/onboarding` | `apps/web/src/app/(app)/projects/[id]/onboarding/page.tsx` | Onboarding wizard |
| `/wizard` | `apps/web/src/app/(app)/wizard/page.tsx` | Global IRIS wizard |
| `/settings` | `apps/web/src/app/(app)/settings/page.tsx` | **MISSING — needs creation** |
| `/projects/[id]/wizard` | `apps/web/src/app/(app)/projects/[id]/wizard/page.tsx` | **MISSING — needs redirect to /autopilot** |

### Layouts

| Layout | File Path |
|--------|-----------|
| Root layout | `apps/web/src/app/layout.tsx` |
| Auth layout | `apps/web/src/app/(auth)/layout.tsx` |
| App layout (protected) | `apps/web/src/app/(app)/layout.tsx` |

---

## SECTION 2 — COMPONENTS

### layout/ (Shell & Navigation)

| Component | File Path | Imported By |
|-----------|-----------|-------------|
| `AppShell` | `apps/web/src/components/layout/AppShell.tsx` | `app/(app)/layout.tsx` |
| `Sidebar` **(ACTIVE)** | `apps/web/src/components/layout/Sidebar.tsx` | `AppShell.tsx` |
| `TopBar` | `apps/web/src/components/layout/TopBar.tsx` | `AppShell.tsx` |
| `PanelResizeDivider` | `apps/web/src/components/layout/PanelResizeDivider.tsx` | Various |
| `WizardLayout` | `apps/web/src/components/layout/WizardLayout.tsx` | ORPHANED |

> ⚠️ `components/Sidebar.tsx` (root level) is ORPHANED — never imported. Always use `components/layout/Sidebar.tsx`.

### iris/ (IRIS AI Wizard)

| Component | File Path | Imported By |
|-----------|-----------|-------------|
| `IrisWorkspace` **(MAIN)** | `apps/web/src/components/iris/IrisWorkspace.tsx` | autopilot page, wizard page |
| `IrisChat` | `apps/web/src/components/iris/IrisChat.tsx` | IrisWorkspace |
| `IrisPreviewPanel` | `apps/web/src/components/iris/IrisPreviewPanel.tsx` | IrisWorkspace |
| `IrisStatusBar` | `apps/web/src/components/iris/IrisStatusBar.tsx` | IrisWorkspace |
| `IrisReadinessBar` | `apps/web/src/components/iris/IrisReadinessBar.tsx` | IrisWorkspace |
| `IrisAssumptionCards` | `apps/web/src/components/iris/IrisAssumptionCards.tsx` | IrisWorkspace |
| `IrisChatMessage` | `apps/web/src/components/iris/IrisChatMessage.tsx` | IrisWorkspace |
| `IrisInputBar` | `apps/web/src/components/iris/IrisInputBar.tsx` | IrisWorkspace |

### autopilot/ (Full-Screen Mode)

| Component | File Path | Imported By |
|-----------|-----------|-------------|
| `AutopilotClient` | `apps/web/src/app/(app)/projects/[id]/autopilot/AutopilotClient.tsx` | autopilot/page.tsx |
| `AutopilotPreviewPanel` | `apps/web/src/components/autopilot/AutopilotPreviewPanel.tsx` | AutopilotClient |
| `ExecutionTopBar` | `apps/web/src/components/autopilot/ExecutionTopBar.tsx` | AutopilotClient |
| `MiniSidebar` | `apps/web/src/components/autopilot/MiniSidebar.tsx` | AutopilotClient |

### command/ (Command Center Dashboard)

| Component | File Path |
|-----------|-----------|
| `CommandCenter` | `apps/web/src/components/command/CommandCenter.tsx` |
| `OverviewPanel` | `apps/web/src/components/command/OverviewPanel.tsx` |
| `ExecutionFeed` | `apps/web/src/components/command/ExecutionFeed.tsx` |
| `AgentRoster` | `apps/web/src/components/command/AgentRoster.tsx` |
| `AgentDetailView` | `apps/web/src/components/command/AgentDetailView.tsx` |
| `ActiveWork` | `apps/web/src/components/command/ActiveWork.tsx` |
| `SystemView` | `apps/web/src/components/command/SystemView.tsx` |
| `SupervisorDashboard` | `apps/web/src/components/command/SupervisorDashboard.tsx` |
| `PreviewTab` | `apps/web/src/components/command/PreviewTab.tsx` |

### dashboard/ (Dashboard Components)

| Component | File Path | Status |
|-----------|-----------|--------|
| `DashboardCTABanner` | `apps/web/src/components/dashboard/DashboardCTABanner.tsx` | ACTIVE |
| `DashboardCTABannerSkeleton` | `apps/web/src/components/dashboard/DashboardCTABannerSkeleton.tsx` | ACTIVE |
| `DashboardCTAContainer` | `apps/web/src/components/dashboard/DashboardCTAContainer.tsx` | ACTIVE |
| `ProjectDashboard` | `apps/web/src/components/dashboard/ProjectDashboard.tsx` | ORPHANED |
| `CommandCenterOverview` | `apps/web/src/components/dashboard/CommandCenterOverview.tsx` | ORPHANED |
| `LiveStatsBar` | `apps/web/src/components/dashboard/LiveStatsBar.tsx` | ORPHANED |

### Other Active Components

| Component | File Path |
|-----------|-----------|
| `ProjectCard` | `apps/web/src/components/projects/ProjectCard.tsx` |
| `LiveTaskBoard` | `apps/web/src/components/tasks/LiveTaskBoard.tsx` |
| `TaskBoard` | `apps/web/src/components/tasks/TaskBoard.tsx` |
| `LiveCostDashboard` | `apps/web/src/components/cost/LiveCostDashboard.tsx` |
| `ReleaseReadinessView` | `apps/web/src/components/release/ReleaseReadinessView.tsx` |
| `OrchestrationPanel` | `apps/web/src/components/orchestration/OrchestrationPanel.tsx` |
| `IntegrationsView` | `apps/web/src/components/integrations/IntegrationsView.tsx` |
| `ConnectIntegrationModal` | `apps/web/src/components/integrations/ConnectIntegrationModal.tsx` |
| `DocsView` | `apps/web/src/components/docs/DocsView.tsx` |
| `LogStream` | `apps/web/src/components/logs/LogStream.tsx` |
| `BlueprintTab` | `apps/web/src/components/wizard/BlueprintTab.tsx` |
| `TasksTab` | `apps/web/src/components/wizard/TasksTab.tsx` |

### UI Primitives (components/ui/)

| Component | File Path |
|-----------|-----------|
| `Button` | `apps/web/src/components/ui/Button.tsx` |
| `Input` | `apps/web/src/components/ui/Input.tsx` |
| `Card` | `apps/web/src/components/ui/Card.tsx` |
| `Badge` | `apps/web/src/components/ui/Badge.tsx` |
| `ProgressBar` | `apps/web/src/components/ui/ProgressBar.tsx` |
| `ToastContainer` | `apps/web/src/components/ui/ToastContainer.tsx` |

---

## SECTION 3 — API ROUTES

### Projects

| Method + Path | File Path |
|---------------|-----------|
| GET/POST `/api/projects` | `apps/web/src/app/api/projects/route.ts` |
| GET/PUT `/api/projects/[id]` | `apps/web/src/app/api/projects/[id]/route.ts` |
| POST `/api/projects/[id]/provision` | `apps/web/src/app/api/projects/[id]/provision/route.ts` |
| GET/POST `/api/projects/[id]/tasks` | `apps/web/src/app/api/projects/[id]/tasks/route.ts` |
| GET/POST `/api/projects/[id]/blueprint` | `apps/web/src/app/api/projects/[id]/blueprint/route.ts` |
| POST `/api/projects/[id]/blueprint/confirm` | `apps/web/src/app/api/projects/[id]/blueprint/confirm/route.ts` |
| GET `/api/projects/[id]/iris` | `apps/web/src/app/api/projects/[id]/iris/route.ts` |
| GET `/api/projects/[id]/draft-preview` | **MISSING — called by IrisWorkspace, needs creation** |
| POST `/api/projects/[id]/iris/exchange` | **MISSING — called by IrisWorkspace, needs creation** |

### IRIS / Wizard

| Method + Path | File Path |
|---------------|-----------|
| POST `/api/iris/chat` | `apps/web/src/app/api/iris/chat/route.ts` |
| GET/POST `/api/wizard/session` | `apps/web/src/app/api/wizard/session/route.ts` |
| POST `/api/wizard/[sessionId]/step` | `apps/web/src/app/api/wizard/[sessionId]/step/route.ts` |
| GET `/api/wizard-state` | `apps/web/src/app/api/wizard-state/route.ts` |
| GET `/api/wizard-readiness` | `apps/web/src/app/api/wizard-readiness/route.ts` |
| GET/POST `/api/wizard-assumptions` | `apps/web/src/app/api/wizard-assumptions/route.ts` |
| PATCH `/api/wizard-assumptions/[id]` | `apps/web/src/app/api/wizard-assumptions/[id]/route.ts` |

### Execution & Tasks

| Method + Path | File Path |
|---------------|-----------|
| POST `/api/agent/generate` | `apps/web/src/app/api/agent/generate/route.ts` |
| POST `/api/agent/execute` | `apps/web/src/app/api/agent/execute/route.ts` |
| GET `/api/agent/output` | `apps/web/src/app/api/agent/output/route.ts` |
| POST `/api/dispatch/task` | `apps/web/src/app/api/dispatch/task/route.ts` |
| GET/PUT `/api/tasks/[id]` | `apps/web/src/app/api/tasks/[id]/route.ts` |
| POST `/api/evaluate/task` | `apps/web/src/app/api/evaluate/task/route.ts` |

### Orchestration

| Method + Path | File Path |
|---------------|-----------|
| POST `/api/orchestrate/activate` | `apps/web/src/app/api/orchestrate/activate/route.ts` |
| GET `/api/orchestrate/status` | `apps/web/src/app/api/orchestrate/status/route.ts` |
| POST `/api/orchestrate/tick` | `apps/web/src/app/api/orchestrate/tick/route.ts` |
| POST `/api/orchestrate/cron` | `apps/web/src/app/api/orchestrate/cron/route.ts` |
| GET `/api/orchestrate/watchdog` | `apps/web/src/app/api/orchestrate/watchdog/route.ts` |
| POST `/api/orchestrate/recovery` | `apps/web/src/app/api/orchestrate/recovery/route.ts` |
| POST `/api/orchestrate/safe-stop` | `apps/web/src/app/api/orchestrate/safe-stop/route.ts` |

### Integrations

| Method + Path | File Path |
|---------------|-----------|
| GET `/api/integrations/providers` | `apps/web/src/app/api/integrations/providers/route.ts` |
| POST `/api/integrations/connect` | `apps/web/src/app/api/integrations/connect/route.ts` |
| GET `/api/integrations/github/connect` | `apps/web/src/app/api/integrations/github/connect/route.ts` |
| GET `/api/integrations/github/callback` | `apps/web/src/app/api/integrations/github/callback/route.ts` |

---

## SECTION 4 — HOOKS, TYPES, LIB

### Hooks (`apps/web/src/hooks/`)

| Hook | File Path |
|------|-----------|
| `useRealtimeTasks` | `apps/web/src/hooks/useRealtimeTasks.ts` |
| `useTasks` | `apps/web/src/hooks/useTasks.ts` |
| `useToast` | `apps/web/src/hooks/useToast.ts` |
| `useLogStream` | `apps/web/src/hooks/useLogStream.ts` |
| `useOrchestration` | `apps/web/src/hooks/useOrchestration.ts` |
| `usePowerWizard` | `apps/web/src/hooks/usePowerWizard.ts` |
| `useResizablePanels` | `apps/web/src/hooks/useResizablePanels.ts` |
| `useTabTransition` | `apps/web/src/hooks/useTabTransition.ts` |
| `useDashboardCTA` | `apps/web/src/hooks/useDashboardCTA.ts` |

### Types (`apps/web/src/types/`)

| Type File | File Path |
|-----------|-----------|
| Main index | `apps/web/src/types/index.ts` |
| Dashboard types | `apps/web/src/types/dashboard.ts` |
| IRIS types | `apps/web/src/types/iris.ts` |
| PowerWizard types | `apps/web/src/types/powerWizard.ts` |
| Provider connections | `apps/web/src/types/provider-connections.ts` |

### Key Lib Files (`apps/web/src/lib/`)

| Library | File Path |
|---------|-----------|
| Supabase (client) | `apps/web/src/lib/supabase/client.ts` |
| Supabase (server) | `apps/web/src/lib/supabase/server.ts` |
| API client | `apps/web/src/lib/api/client.ts` |
| Blueprint generator | `apps/web/src/lib/blueprint-generator.ts` |
| Code generator | `apps/web/src/lib/code-generator.ts` |
| Patch engine | `apps/web/src/lib/patch-engine.ts` |
| Execution | `apps/web/src/lib/execution.ts` |
| GitHub provision | `apps/web/src/lib/github-provision.ts` |
| GitHub commit | `apps/web/src/lib/github-commit.ts` |
| Vercel provision | `apps/web/src/lib/vercel-provision.ts` |
| Orchestration | `apps/web/src/lib/orchestration.ts` |
| Supervisor | `apps/web/src/lib/supervisor.ts` |
| Routing | `apps/web/src/lib/routing.ts` |
| Provider connections | `apps/web/src/lib/provider-connections.ts` |
| Ownership resolver | `apps/web/src/lib/ownership-resolver.ts` |
| Wizard readiness | `apps/web/src/lib/wizard-readiness.ts` |
| Utils | `apps/web/src/lib/utils.ts` |
| Types | `apps/web/src/lib/types.ts` |

### Contexts

| Context | File Path |
|---------|-----------|
| `AutopilotContext` | `apps/web/src/contexts/AutopilotContext.tsx` |

---

## SECTION 5 — KNOWN MISSING FILES (to be created)

These files do not yet exist but are needed:

| File | Path | Why Needed |
|------|------|------------|
| Global settings page | `apps/web/src/app/(app)/settings/page.tsx` | `/settings` returns 404 |
| Project wizard redirect | `apps/web/src/app/(app)/projects/[id]/wizard/page.tsx` | `/projects/[id]/wizard` returns 404 |
| Draft preview API | `apps/web/src/app/api/projects/[id]/draft-preview/route.ts` | IrisWorkspace calls this on mount |
| IRIS exchange API | `apps/web/src/app/api/projects/[id]/iris/exchange/route.ts` | IrisWorkspace posts messages here |

---

## SECTION 6 — ORPHANED FILES (do not import these)

These files exist on disk but are NOT imported by any active code:

| File | Why Orphaned |
|------|-------------|
| `apps/web/src/components/Sidebar.tsx` | Replaced by `layout/Sidebar.tsx` — AppShell uses layout version |
| `apps/web/src/components/PowerWizardClient.tsx` | Created by P9D agent at wrong level; never imported |
| `apps/web/src/components/BuildOSWizard.tsx` | Legacy wizard, replaced |
| `apps/web/src/components/ProvisioningStatus.tsx` | Unused |
| `apps/web/src/components/layout/WizardLayout.tsx` | Unused |
| `apps/web/src/components/dashboard/ProjectDashboard.tsx` | Replaced by CommandCenter |
| `apps/web/src/components/dashboard/CommandCenterOverview.tsx` | Unused |
| `apps/web/src/components/dashboard/LiveStatsBar.tsx` | Unused |
| `apps/web/src/components/onboarding/OnboardingWizard.tsx` | Replaced by onboarding page |
| `apps/web/src/components/projects/ProvisioningBadge.tsx` | Unused |
| `apps/web/src/components/ui/Spinner.tsx` | Unused |
| `apps/web/src/components/iris/IrisMobileTabs.tsx` | Unused |
| `apps/web/src/components/RightPanel/RightPanel.tsx` | Replaced by newer panel system |

---

## HOW TO MAINTAIN THIS FILE

When an agent **creates a new file**, it MUST:
1. Add the file to the appropriate section above
2. Include: path, purpose, imported by (if component)
3. Mark the row with `[NEW - PHASE X]` in notes

When an agent **deletes or deprecates a file**, it MUST:
1. Move it to Section 6 (Orphaned) or remove it entirely
2. Note why it was deprecated

This file is tracked in git. Every PR that adds/modifies files should update CODEBASE-MAP.md in the same commit.
