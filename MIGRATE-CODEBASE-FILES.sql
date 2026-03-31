-- MIGRATE-CODEBASE-FILES.sql
-- Creates the codebase_files table: a queryable registry of all active files in Build OS.
-- Agents can query this table to find the correct path for any component, route, hook, or API.
-- Run this in: Supabase > SQL Editor > Paste > Run
-- (pg.Client NEVER works for migrations in this project — always use Supabase SQL Editor)

-- ─── Create table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS codebase_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path     TEXT NOT NULL UNIQUE,          -- relative from repo root, e.g. "apps/web/src/components/layout/Sidebar.tsx"
  file_type     TEXT NOT NULL,                 -- 'component' | 'page' | 'api_route' | 'hook' | 'lib' | 'type' | 'layout' | 'context' | 'migration' | 'config' | 'document'
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'orphaned' | 'missing'
  description   TEXT,                          -- 1-line what it does
  imported_by   TEXT[],                        -- array of file_paths that import this file
  url_route     TEXT,                          -- for pages: the URL route, e.g. "/settings"
  component_name TEXT,                         -- for components: the exported component name
  notes         TEXT,                          -- any important agent-facing notes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Index for fast lookups ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_codebase_files_type   ON codebase_files(file_type);
CREATE INDEX IF NOT EXISTS idx_codebase_files_status ON codebase_files(status);
CREATE INDEX IF NOT EXISTS idx_codebase_files_route  ON codebase_files(url_route);

-- ─── RLS: allow service role full access ─────────────────────────────────────
ALTER TABLE codebase_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON codebase_files
  USING (true)
  WITH CHECK (true);

-- ─── Seed: Active Layout & Navigation Files ───────────────────────────────────

INSERT INTO codebase_files (file_path, file_type, status, description, imported_by, url_route, component_name, notes) VALUES

-- Layouts
('apps/web/src/app/layout.tsx', 'layout', 'active', 'Root HTML layout', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/app/(auth)/layout.tsx', 'layout', 'active', 'Auth layout with gradient', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/app/(app)/layout.tsx', 'layout', 'active', 'Protected app layout with auth check', ARRAY[]::TEXT[], NULL, NULL, NULL),

-- Shell & Navigation (CRITICAL — agents often get these wrong)
('apps/web/src/components/layout/AppShell.tsx', 'component', 'active', 'Main app shell: renders sidebar or full-screen', ARRAY['apps/web/src/app/(app)/layout.tsx'], NULL, 'AppShell', 'Suppresses sidebar on /autopilot routes via isAutopilot check'),
('apps/web/src/components/layout/Sidebar.tsx', 'component', 'active', 'PRIMARY sidebar with nav, project links, footer', ARRAY['apps/web/src/components/layout/AppShell.tsx'], NULL, 'Sidebar', 'ACTIVE SIDEBAR — this is what AppShell renders. NOT components/Sidebar.tsx'),
('apps/web/src/components/layout/TopBar.tsx', 'component', 'active', 'Top nav bar with page title', ARRAY['apps/web/src/components/layout/AppShell.tsx'], NULL, 'TopBar', NULL),

-- ORPHANED (agents must never reference these)
('apps/web/src/components/Sidebar.tsx', 'component', 'orphaned', 'Duplicate sidebar at wrong path — never imported', ARRAY[]::TEXT[], NULL, 'Sidebar', 'ORPHANED — use layout/Sidebar.tsx instead'),
('apps/web/src/components/PowerWizardClient.tsx', 'component', 'orphaned', 'Step wizard created by P9D agent at wrong path', ARRAY[]::TEXT[], NULL, 'PowerWizardClient', 'ORPHANED — never imported by any route or component'),

-- Pages (routes)
('apps/web/src/app/(auth)/login/page.tsx', 'page', 'active', 'Login form', ARRAY[]::TEXT[], '/login', NULL, NULL),
('apps/web/src/app/(auth)/signup/page.tsx', 'page', 'active', 'Signup form', ARRAY[]::TEXT[], '/signup', NULL, NULL),
('apps/web/src/app/(app)/projects/page.tsx', 'page', 'active', 'Projects list', ARRAY[]::TEXT[], '/projects', NULL, NULL),
('apps/web/src/app/(app)/projects/new/page.tsx', 'page', 'active', 'Create new project', ARRAY[]::TEXT[], '/projects/new', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/page.tsx', 'page', 'active', 'Project Command Center dashboard', ARRAY[]::TEXT[], '/projects/[id]', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/tasks/page.tsx', 'page', 'active', 'Task board', ARRAY[]::TEXT[], '/projects/[id]/tasks', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/autopilot/page.tsx', 'page', 'active', 'Full-screen IRIS autopilot', ARRAY[]::TEXT[], '/projects/[id]/autopilot', NULL, 'Imports AutopilotClient from ./AutopilotClient'),
('apps/web/src/app/(app)/projects/[id]/agents/page.tsx', 'page', 'active', 'Agent roster', ARRAY[]::TEXT[], '/projects/[id]/agents', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/system/page.tsx', 'page', 'active', 'System health', ARRAY[]::TEXT[], '/projects/[id]/system', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/preview/page.tsx', 'page', 'active', 'Live preview', ARRAY[]::TEXT[], '/projects/[id]/preview', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/release/page.tsx', 'page', 'active', 'Release management', ARRAY[]::TEXT[], '/projects/[id]/release', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/cost/page.tsx', 'page', 'active', 'Cost dashboard', ARRAY[]::TEXT[], '/projects/[id]/cost', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/orchestrate/page.tsx', 'page', 'active', 'Orchestration control', ARRAY[]::TEXT[], '/projects/[id]/orchestrate', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/docs/page.tsx', 'page', 'active', 'Documentation viewer', ARRAY[]::TEXT[], '/projects/[id]/docs', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/integrations/page.tsx', 'page', 'active', 'Integrations management', ARRAY[]::TEXT[], '/projects/[id]/integrations', NULL, NULL),
('apps/web/src/app/(app)/projects/[id]/settings/page.tsx', 'page', 'active', 'Project settings', ARRAY[]::TEXT[], '/projects/[id]/settings', NULL, NULL),
('apps/web/src/app/(app)/wizard/page.tsx', 'page', 'active', 'Global IRIS wizard (no projectId)', ARRAY[]::TEXT[], '/wizard', NULL, NULL),

-- MISSING pages (created by P9D-FIX-2)
('apps/web/src/app/(app)/settings/page.tsx', 'page', 'missing', 'Global user settings — MISSING, /settings returns 404', ARRAY[]::TEXT[], '/settings', NULL, 'Created by P9D-FIX-2-WS1-T1'),
('apps/web/src/app/(app)/projects/[id]/wizard/page.tsx', 'page', 'missing', 'Project wizard redirect — MISSING, /projects/[id]/wizard returns 404', ARRAY[]::TEXT[], '/projects/[id]/wizard', NULL, 'Created by P9D-FIX-2-WS1-T2; should redirect to /autopilot'),

-- IRIS Components
('apps/web/src/components/iris/IrisWorkspace.tsx', 'component', 'active', 'Main IRIS chat + preview panel', ARRAY['apps/web/src/app/(app)/projects/[id]/autopilot/AutopilotClient.tsx', 'apps/web/src/app/(app)/wizard/page.tsx'], NULL, 'IrisWorkspace', 'Calls /api/projects/[id]/draft-preview and /api/projects/[id]/iris/exchange'),
('apps/web/src/components/iris/IrisPreviewPanel.tsx', 'component', 'active', 'Blueprint preview panel', ARRAY['apps/web/src/components/iris/IrisWorkspace.tsx'], NULL, 'IrisPreviewPanel', NULL),
('apps/web/src/components/iris/IrisChatMessage.tsx', 'component', 'active', 'Single chat message bubble', ARRAY['apps/web/src/components/iris/IrisWorkspace.tsx'], NULL, 'IrisChatMessage', NULL),
('apps/web/src/components/iris/IrisInputBar.tsx', 'component', 'active', 'Chat input with submit', ARRAY['apps/web/src/components/iris/IrisWorkspace.tsx'], NULL, 'IrisInputBar', NULL),

-- Autopilot Components
('apps/web/src/app/(app)/projects/[id]/autopilot/AutopilotClient.tsx', 'component', 'active', 'Full-screen autopilot shell', ARRAY['apps/web/src/app/(app)/projects/[id]/autopilot/page.tsx'], NULL, 'AutopilotClient', NULL),
('apps/web/src/components/autopilot/AutopilotPreviewPanel.tsx', 'component', 'active', 'Preview panel in autopilot mode', ARRAY['apps/web/src/app/(app)/projects/[id]/autopilot/AutopilotClient.tsx'], NULL, 'AutopilotPreviewPanel', NULL),

-- API Routes
('apps/web/src/app/api/projects/[id]/iris/route.ts', 'api_route', 'active', 'POST IRIS conversation — accepts {message, history}', ARRAY[]::TEXT[], '/api/projects/[id]/iris', NULL, 'Full IRIS discovery chat with blueprint generation on complete'),
('apps/web/src/app/api/projects/[id]/iris/exchange/route.ts', 'api_route', 'missing', 'POST IRIS exchange — simple {message}→{reply} — MISSING', ARRAY[]::TEXT[], '/api/projects/[id]/iris/exchange', NULL, 'Created by P9D-FIX-2-WS2-T2. Different from iris/route.ts'),
('apps/web/src/app/api/projects/[id]/draft-preview/route.ts', 'api_route', 'missing', 'GET draft preview data — returns blueprint as IrisPreviewData — MISSING', ARRAY[]::TEXT[], '/api/projects/[id]/draft-preview', NULL, 'Created by P9D-FIX-2-WS2-T1. Called by IrisWorkspace on mount'),
('apps/web/src/app/api/projects/[id]/blueprint/route.ts', 'api_route', 'active', 'GET/POST project blueprint', ARRAY[]::TEXT[], '/api/projects/[id]/blueprint', NULL, NULL),
('apps/web/src/app/api/projects/route.ts', 'api_route', 'active', 'GET/POST projects', ARRAY[]::TEXT[], '/api/projects', NULL, NULL),
('apps/web/src/app/api/workspaces/route.ts', 'api_route', 'active', 'GET user workspaces', ARRAY[]::TEXT[], '/api/workspaces', NULL, NULL),

-- Hooks
('apps/web/src/hooks/useRealtimeTasks.ts', 'hook', 'active', 'WebSocket real-time task updates', ARRAY[]::TEXT[], NULL, 'useRealtimeTasks', NULL),
('apps/web/src/hooks/useTasks.ts', 'hook', 'active', 'Fetch and manage project tasks', ARRAY[]::TEXT[], NULL, 'useTasks', NULL),
('apps/web/src/hooks/useToast.ts', 'hook', 'active', 'Toast notification management', ARRAY[]::TEXT[], NULL, 'useToast', NULL),
('apps/web/src/hooks/usePowerWizard.ts', 'hook', 'active', 'Power Wizard state management', ARRAY[]::TEXT[], NULL, 'usePowerWizard', NULL),

-- Types
('apps/web/src/types/iris.ts', 'type', 'active', 'IRIS preview data, ChatMessage, DraftPreviewResponse types', ARRAY['apps/web/src/components/iris/IrisWorkspace.tsx'], NULL, NULL, NULL),
('apps/web/src/types/powerWizard.ts', 'type', 'active', 'PowerWizard config/state/action types', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/types/dashboard.ts', 'type', 'active', 'Phase, Blueprint, Project dashboard types', ARRAY[]::TEXT[], NULL, NULL, NULL),

-- Key Lib Files
('apps/web/src/lib/supabase/client.ts', 'lib', 'active', 'Supabase browser client', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/lib/supabase/server.ts', 'lib', 'active', 'Supabase server client (SSR)', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/lib/utils.ts', 'lib', 'active', 'cn() classname utility and helpers', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/lib/execution.ts', 'lib', 'active', 'Main execution engine', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/lib/github-provision.ts', 'lib', 'active', 'GitHub repo provisioning', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/src/lib/github-commit.ts', 'lib', 'active', 'Commit code to GitHub', ARRAY[]::TEXT[], NULL, NULL, NULL),

-- Contexts
('apps/web/src/contexts/AutopilotContext.tsx', 'context', 'active', 'Autopilot/PowerWizard React context', ARRAY['apps/web/src/app/(app)/projects/[id]/autopilot/AutopilotClient.tsx'], NULL, 'AutopilotProvider', NULL),

-- Config
('apps/web/src/middleware.ts', 'config', 'active', 'Next.js auth routing middleware', ARRAY[]::TEXT[], NULL, NULL, NULL),
('apps/web/next.config.mjs', 'config', 'active', 'Next.js configuration', ARRAY[]::TEXT[], NULL, NULL, NULL),

-- Documentation (repo root)
('CODEBASE-MAP.md', 'document', 'active', 'Human+agent readable file registry', ARRAY[]::TEXT[], NULL, NULL, 'Update whenever files are added or deleted'),
('IRIS-ARCHITECT-PROTOCOL.md', 'document', 'active', 'Task creation protocol for IRIS/Claude acting as architect', ARRAY[]::TEXT[], NULL, NULL, 'Read before creating any sprint or task')

ON CONFLICT (file_path) DO UPDATE SET
  status      = EXCLUDED.status,
  description = EXCLUDED.description,
  notes       = EXCLUDED.notes,
  updated_at  = now();

-- ─── Verify ────────────────────────────────────────────────────────────────────
SELECT
  status,
  COUNT(*) as count
FROM codebase_files
GROUP BY status
ORDER BY status;
