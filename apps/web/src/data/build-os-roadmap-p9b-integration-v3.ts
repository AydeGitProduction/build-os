/**
 * P9B-INTEGRATION v3 — Real Wizard State
 *
 * Makes the IRIS wizard fully real during the conversation, not only at completion.
 *
 * 1 epic | 6 features | 19 tasks
 * Workstreams: I1 (Backend Wizard State) · I2 (Backend Assumptions) ·
 *              I3 (Real Readiness Engine) · I4 (Backend-Driven Preview) ·
 *              I5 (Event/Confidence Trigger) · I6 (Reality QA)
 */

export interface TaskDef {
  title: string
  description: string
  agent_role: string
  task_type: 'code' | 'schema' | 'document' | 'test' | 'review' | 'deploy' | 'design'
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimated_cost_usd: number
  order_index: number
  status?: 'pending' | 'ready'
}

export interface FeatureDef {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  order_index: number
  tasks: TaskDef[]
}

export interface EpicDef {
  title: string
  description: string
  order_index: number
  features: FeatureDef[]
}

export const BUILD_OS_ROADMAP_P9B_INTEGRATION_V3: EpicDef[] = [
  {
    title: 'P9B-INTEGRATION v3 — Real Wizard State',
    description: 'Eliminate all frontend-fabricated state from the IRIS wizard. After this epic, wizard_state is canonical in the backend, assumptions are persisted per project, readiness is computed from real field coverage, preview is driven by backend draft data, the blueprint trigger fires on confidence threshold not message count, and a full reload restores all state from the server.',
    order_index: 1,
    features: [

      // ── I1: Backend Wizard State ─────────────────────────────────────────────
      {
        title: 'I1 — Backend Wizard State',
        description: 'Store canonical wizard conversation state (message history, turn index, collected fields, session metadata) in the database, keyed by project_id. Hydrate IrisChat from this state on mount. Autosave after every message exchange. A mid-conversation page reload must restore the exact prior state.',
        priority: 'critical',
        order_index: 1,
        tasks: [
          {
            title: 'I1-DB: Migration — wizard_conversations table',
            description: `**OBJECTIVE**
Create the wizard_conversations table that stores canonical per-project wizard state.

**WHY IT MATTERS**
Currently, all mid-conversation history is held only in React component state. A reload loses everything. This table makes the backend the source of truth for in-progress wizard sessions.

**STEP-BY-STEP IMPLEMENTATION**
1. Create migration file: migrations/20260330000024_wizard_conversations.sql
2. Table DDL:
\`\`\`sql
CREATE TABLE wizard_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  messages        jsonb NOT NULL DEFAULT '[]',
  collected_fields jsonb NOT NULL DEFAULT '{}',
  turn_index      integer NOT NULL DEFAULT 0,
  readiness       integer NOT NULL DEFAULT 0,
  trigger_fired   boolean NOT NULL DEFAULT false,
  trigger_reason  text,
  triggered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wizard_conversations_project_id_key UNIQUE (project_id)
);
CREATE INDEX wizard_conversations_project_id_idx ON wizard_conversations (project_id);
ALTER TABLE wizard_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_member_wizard" ON wizard_conversations
  USING (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  ));
\`\`\`
3. messages column stores array of {role, content, timestamp} objects
4. collected_fields stores keyed extracted data: {product_name, target_audience, core_problem, key_features, monetisation, integrations_needed, ai_features, timeline_weeks, budget_usd, compliance}
5. Run migration in Supabase production via Management API

**AFFECTED FILES / DB ENTITIES**
- migrations/20260330000024_wizard_conversations.sql (NEW)
- Supabase schema (wizard_conversations table)

**EXPECTED OUTPUT**
Table wizard_conversations exists in production DB. UNIQUE constraint on project_id. RLS enabled.

**EDGE CASES**
- Duplicate project_id insert must upsert (ON CONFLICT DO UPDATE)
- messages column must handle empty array default safely
- RLS must allow service-role admin bypass

**ACCEPTANCE CRITERIA**
- [ ] Migration file exists and is syntactically valid
- [ ] Table created in production Supabase
- [ ] UNIQUE(project_id) constraint verified
- [ ] RLS policy blocks cross-user reads
- [ ] Admin client can bypass RLS

**QA CHECKLIST**
- [ ] SELECT from wizard_conversations returns empty for new project
- [ ] INSERT with same project_id twice causes upsert not duplicate
- [ ] Service role admin can read all rows
- [ ] User JWT blocked from reading another user's project rows

**HANDOFF NOTES**
I1-BE depends on this table. Run migration before I1-BE work begins. Use admin client for all wizard_conversations operations (same pattern as questionnaires table).`,
            agent_role: 'database_engineer',
            task_type: 'schema',
            priority: 'critical',
            estimated_cost_usd: 0.05,
            order_index: 0,
            status: 'ready',
          },
          {
            title: 'I1-BE: wizard-state GET + POST/PATCH API route',
            description: `**OBJECTIVE**
Implement GET /api/projects/[id]/wizard-state and POST/PATCH /api/projects/[id]/wizard-state for loading and saving conversation state.

**WHY IT MATTERS**
IrisChat needs a reliable backend roundtrip to persist state. Without this route, any autosave logic would have nowhere to write.

**STEP-BY-STEP IMPLEMENTATION**
1. Create: apps/web/src/app/api/projects/[id]/wizard-state/route.ts
2. GET handler:
   - Auth via createServerSupabaseClient
   - Query wizard_conversations WHERE project_id = params.id (admin client)
   - Return { data: { messages, collected_fields, turn_index, readiness, trigger_fired } } or { data: null } if not found
3. POST/PATCH handler:
   - Accept body: { messages?, collected_fields?, turn_index?, readiness?, trigger_fired?, trigger_reason? }
   - Use admin.from('wizard_conversations').upsert({ project_id: params.id, ...body, updated_at: now() }, { onConflict: 'project_id' })
   - Return { data: upserted_row }
4. Validate: project must belong to authed user's workspace (check via projects table, not RLS alone — same pattern as existing routes)
5. Always use createAdminSupabaseClient() for DB ops (RLS bypassed, same as questionnaires)

**AFFECTED FILES / ROUTES / COMPONENTS**
- apps/web/src/app/api/projects/[id]/wizard-state/route.ts (NEW)

**EXPECTED OUTPUT**
- GET returns prior state or null for fresh projects
- POST/PATCH upserts and returns full row
- 401 if not authenticated
- 404 if project not found or not in user's workspace

**EDGE CASES**
- First call for a project: GET returns null (handled by IrisChat as "fresh session")
- Partial update: only pass changed fields, upsert merges via DB default values
- Concurrent writes: last-write-wins acceptable at this stage (single user per project)

**ACCEPTANCE CRITERIA**
- [ ] GET /api/projects/{id}/wizard-state returns null for new project
- [ ] POST saves messages array and returns saved row
- [ ] GET after POST returns the saved messages
- [ ] 401 returned without auth
- [ ] project ownership check prevents cross-user access

**QA CHECKLIST**
- [ ] curl GET returns 200 with data:null for new project
- [ ] curl POST with messages=[{role:'user',content:'test'}] returns 200 with saved row
- [ ] curl GET after POST returns messages array intact
- [ ] curl GET with different user JWT returns 404

**HANDOFF NOTES**
I1-FE depends on this route. Confirm GET null + POST roundtrip works before starting frontend hydration work.`,
            agent_role: 'backend_engineer',
            task_type: 'code',
            priority: 'critical',
            estimated_cost_usd: 0.08,
            order_index: 1,
          },
          {
            title: 'I1-FE: IrisChat hydration from backend on mount',
            description: `**OBJECTIVE**
Modify IrisChat.tsx to load existing wizard_conversations state from the backend on mount. If prior history exists, skip the boot "Hello" call and restore the conversation display. If none, proceed with current boot flow.

**WHY IT MATTERS**
A user who navigates away mid-conversation and returns must see their conversation where they left it. Without this, every visit resets the wizard and the duplicate "Hello" boot message is sent again — breaking continuity.

**STEP-BY-STEP IMPLEMENTATION**
1. In IrisChat.tsx useEffect (boot), before calling sendMessage('Hello', true):
   a. Call GET /api/projects/{projectId}/wizard-state
   b. If response.data is non-null and messages.length > 0:
      - setMessages(savedState.messages) to restore display
      - setHistory(savedState.messages.filter(m => !m.isTyping)) to restore API history
      - setBootedRef(true) to skip boot
      - Return early — do NOT call sendMessage('Hello', true)
   c. If response.data is null or messages is empty: proceed with current boot flow
2. Extract hydration into a helper: async function loadWizardState(): Promise<WizardState | null>
3. Show a brief "Restoring conversation…" skeleton while loading (300ms max)
4. On hydration error (network/5xx): fall back to fresh boot silently

**AFFECTED FILES / ROUTES / COMPONENTS**
- apps/web/src/components/onboarding/IrisChat.tsx (MODIFY)
- Calls: GET /api/projects/[id]/wizard-state

**EXPECTED OUTPUT**
- Fresh project: normal boot flow, IRIS greets user
- Returning user: messages rendered from backend, no duplicate greeting
- Network error during hydration: graceful fallback to fresh boot

**EDGE CASES**
- isTyping:true messages in saved state must be stripped before restoration (they represent transient UI state)
- If trigger_fired is true in saved state, show the "Blueprint generating…" completion screen immediately
- Race condition: user sends message before hydration resolves — queue message and send after hydration

**ACCEPTANCE CRITERIA**
- [ ] Fresh project: boot greeting appears normally
- [ ] After 3 exchanges: reload shows exact same 3 exchanges (no re-greeting)
- [ ] trigger_fired=true in DB: shows "Blueprint generating…" screen on reload without re-sending
- [ ] Network error during load: normal fresh boot, no broken state

**QA CHECKLIST**
- [ ] Send 2 messages, navigate to /dashboard, return to /onboarding — prior messages visible
- [ ] Hard refresh (Ctrl+Shift+R) — messages restored from backend not localStorage
- [ ] Open incognito same URL — no messages (different user)
- [ ] DevTools: no localStorage keys holding conversation state

**HANDOFF NOTES**
Remove any existing localStorage read/write in IrisChat once this is live. localStorage must not be consulted for conversation state. I1-INT verifies this.`,
            agent_role: 'frontend_engineer',
            task_type: 'code',
            priority: 'critical',
            estimated_cost_usd: 0.10,
            order_index: 2,
          },
          {
            title: 'I1-INT: Mid-conversation autosave after every exchange',
            description: `**OBJECTIVE**
After each completed IRIS exchange (user message sent + assistant reply received), POST the updated messages and collected_fields to /api/projects/[id]/wizard-state. Verify reload at any point restores state.

**WHY IT MATTERS**
Hydration on mount is useless without a save on each exchange. This closes the persistence loop and makes the backend truly canonical.

**STEP-BY-STEP IMPLEMENTATION**
1. In IrisChat.tsx sendMessage(), after the successful reply is received and state is set:
   a. Build savePayload = { messages: currentMessages, turn_index: history.length, collected_fields: {} }
   b. Call POST /api/projects/{projectId}/wizard-state with savePayload (fire-and-forget with .catch logging)
2. Do NOT await the save — non-blocking to avoid slowing the UI
3. On complete=true: add trigger_fired:true to the save payload before redirect
4. Add error boundary: if save returns 4xx/5xx, log to console but do NOT show error to user (non-critical path)
5. Integration test: use Playwright or manual browser steps to verify:
   - Send 2 exchanges
   - Hard reload
   - Verify messages are restored
   - Send 1 more exchange
   - Hard reload again
   - Verify all 3 exchanges present

**AFFECTED FILES**
- apps/web/src/components/onboarding/IrisChat.tsx (MODIFY, add save call)
- Calls: POST /api/projects/[id]/wizard-state

**EXPECTED OUTPUT**
After each exchange, wizard_conversations row updated in DB. Reload restores all exchanges sent so far.

**EDGE CASES**
- Save fails silently: conversation continues, user is unaware. Next reload may lose the last exchange. Acceptable tradeoff — improve to queued retry in future.
- Rapid fire: if user sends messages before prior save completes, use latest message array (not race)
- Complete=true race: save with trigger_fired before redirect; redirect may win race if network fast

**ACCEPTANCE CRITERIA**
- [ ] After exchange 1: DB row has 1 message pair in messages array
- [ ] After exchange 3: DB row has 3 message pairs
- [ ] Hard reload after exchange 2: IrisChat shows 2 message pairs without re-greeting
- [ ] trigger_fired=true in DB after wizard completes
- [ ] No localStorage writes for conversation state

**QA CHECKLIST**
- [ ] Open Supabase table view, send 2 exchanges, confirm messages column has 4 rows (2 user + 2 assistant)
- [ ] Hard reload, confirm UI shows 2 exchanges
- [ ] DevTools Network tab: POST to /wizard-state fires after each IRIS reply
- [ ] localStorage inspection: no conversation keys present

**HANDOFF NOTES**
This task completes I1. After this, I1 acceptance criteria are met. I6-QA will re-verify this in its test suite. Hand off I1 completion to I6-QA owner with the Playwright repro steps.`,
            agent_role: 'integration_engineer',
            task_type: 'test',
            priority: 'critical',
            estimated_cost_usd: 0.08,
            order_index: 3,
          },
        ],
      },

      // ── I2: Backend Assumptions ──────────────────────────────────────────────
      {
        title: 'I2 — Backend Assumptions',
        description: 'Persist assumption cards (label, value, status: pending/accepted/rejected/modified) in the database per project. Accept/reject/modify actions must write to backend immediately and survive full page reload. Remove localStorage as the write store for assumptions.',
        priority: 'critical',
        order_index: 2,
        tasks: [
          {
            title: 'I2-DB: Migration — wizard_assumptions table',
            description: `**OBJECTIVE**
Create wizard_assumptions table for per-project assumption persistence.

**WHY IT MATTERS**
Currently assumptions are stored only in localStorage via IrisWorkspace. A reload or new browser loses all accept/reject/modify actions. This table makes assumptions backend-canonical.

**STEP-BY-STEP IMPLEMENTATION**
1. Create: migrations/20260330000025_wizard_assumptions.sql
2. Table DDL:
\`\`\`sql
CREATE TABLE wizard_assumptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assumption_key  text NOT NULL,
  label           text NOT NULL,
  value           text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','modified')),
  modified_value  text,
  acted_by        uuid REFERENCES auth.users(id),
  acted_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wizard_assumptions_project_assumption_key UNIQUE (project_id, assumption_key)
);
CREATE INDEX wizard_assumptions_project_idx ON wizard_assumptions (project_id);
ALTER TABLE wizard_assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_member_assumptions" ON wizard_assumptions
  USING (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  ));
\`\`\`
3. assumption_key is the stable identifier (e.g. "tech_stack", "team_size", "timeline") — same as IrisAssumption.id in frontend
4. Run migration in production

**AFFECTED FILES**
- migrations/20260330000025_wizard_assumptions.sql (NEW)

**EXPECTED OUTPUT**
wizard_assumptions table in production with UNIQUE(project_id, assumption_key).

**EDGE CASES**
- Same assumption_key updated multiple times: upsert, not duplicate insert
- Soft delete not needed — if assumption re-appears, upsert resets it

**ACCEPTANCE CRITERIA**
- [ ] Table created in production
- [ ] UNIQUE(project_id, assumption_key) verified
- [ ] RLS blocks cross-user reads

**QA CHECKLIST**
- [ ] INSERT two rows with same (project_id, assumption_key) causes upsert
- [ ] Admin can read all, user JWT sees only own project's assumptions

**HANDOFF NOTES**
I2-BE depends on this. Run before I2-BE.`,
            agent_role: 'database_engineer',
            task_type: 'schema',
            priority: 'critical',
            estimated_cost_usd: 0.04,
            order_index: 0,
            status: 'ready',
          },
          {
            title: 'I2-BE: Assumptions CRUD routes — POST seed + PATCH action',
            description: `**OBJECTIVE**
Implement POST /api/projects/[id]/wizard-assumptions (seed/upsert a batch of assumptions) and PATCH /api/projects/[id]/wizard-assumptions/[key] (update status + modified_value for a single assumption).

**WHY IT MATTERS**
The frontend needs to write accept/reject/modify actions to the backend. Without these routes, all assumption state stays in localStorage and doesn't survive reload.

**STEP-BY-STEP IMPLEMENTATION**
1. Create: apps/web/src/app/api/projects/[id]/wizard-assumptions/route.ts
   - GET: return all assumptions for project ordered by created_at
   - POST: accept body { assumptions: Array<{key, label, value}> }; batch upsert (onConflict: 'project_id,assumption_key'); return seeded rows
2. Create: apps/web/src/app/api/projects/[id]/wizard-assumptions/[key]/route.ts
   - PATCH: accept body { status: 'accepted'|'rejected'|'modified', modified_value?: string }
   - Update wizard_assumptions WHERE project_id=id AND assumption_key=key
   - Set acted_by=user.id, acted_at=now(), updated_at=now()
   - Return updated row
3. Both routes: auth via createServerSupabaseClient, DB ops via admin client
4. Both routes: 404 if project not in user's workspace

**AFFECTED FILES**
- apps/web/src/app/api/projects/[id]/wizard-assumptions/route.ts (NEW)
- apps/web/src/app/api/projects/[id]/wizard-assumptions/[key]/route.ts (NEW)

**EXPECTED OUTPUT**
- POST seeds assumption rows from IRIS-generated assumptions list
- PATCH updates single assumption status/value
- GET returns current state of all assumptions for reload hydration

**EDGE CASES**
- PATCH on non-existent assumption_key: 404
- Re-accepting already-accepted: idempotent, returns updated row
- modified_value required when status=modified: validate server-side

**ACCEPTANCE CRITERIA**
- [ ] POST /assumptions seeds 3 assumptions, GET returns all 3
- [ ] PATCH /assumptions/tech_stack with status=accepted: row updated
- [ ] GET after PATCH: tech_stack status=accepted
- [ ] PATCH with status=modified but no modified_value: 400

**QA CHECKLIST**
- [ ] Seed 3 assumptions via POST
- [ ] PATCH first one to accepted, verify DB row
- [ ] PATCH second to modified with new value
- [ ] GET returns all 3 with correct statuses
- [ ] Hard reload, GET again — same statuses

**HANDOFF NOTES**
PATCH route is called by I2-FE on every assumption card action. GET route is called by I2-FE on hydration.`,
            agent_role: 'backend_engineer',
            task_type: 'code',
            priority: 'critical',
            estimated_cost_usd: 0.09,
            order_index: 1,
          },
          {
            title: 'I2-FE: IrisAssumptionCards backend integration — write + hydrate',
            description: `**OBJECTIVE**
Modify IrisAssumptionCards (and IrisWorkspace where it manages assumption state) to:
1. Seed assumptions to backend when IRIS first generates them
2. Write accept/reject/modify actions to backend via PATCH immediately
3. Hydrate from backend GET on component mount
4. Remove all localStorage writes for assumption state

**WHY IT MATTERS**
Currently onAction fires → IrisWorkspace updates localStorage. This must be replaced with an API call so assumption state survives reload and is browser-agnostic.

**STEP-BY-STEP IMPLEMENTATION**
1. In IrisWorkspace.tsx, when blueprint assumptions are parsed from IRIS response:
   - POST /api/projects/{id}/wizard-assumptions with the full assumptions array (fire-and-forget)
2. In IrisAssumptionCards.tsx, onAction handler:
   - Replace localStorage write with: PATCH /api/projects/{id}/wizard-assumptions/{assumptionKey}
   - Body: { status: action, modified_value: newValue || undefined }
   - On success: update local display state (already done via setItems)
   - On failure: show inline error "Could not save — try again" (do not revert UI immediately)
3. In IrisWorkspace.tsx on mount:
   - Call GET /api/projects/{id}/wizard-assumptions
   - Merge results into assumption display state (same merge logic as current useEffect)
   - Remove localStorage.getItem call for assumptions
4. Find and delete all localStorage.setItem / localStorage.getItem calls for assumption state

**AFFECTED FILES**
- apps/web/src/components/iris/IrisAssumptionCards.tsx (MODIFY)
- apps/web/src/components/iris/IrisWorkspace.tsx (MODIFY)

**EXPECTED OUTPUT**
Clicking "Accept" on an assumption card: PATCH fires, DB row updates, UI reflects accepted state. Hard reload: assumptions restored with correct statuses.

**EDGE CASES**
- Network error on PATCH: show inline error, keep UI optimistic (do not revert)
- No assumptions generated yet: GET returns empty array, component renders nothing (same as today)
- IRIS generates new assumptions after user already acted on old ones: merge preserves existing statuses

**ACCEPTANCE CRITERIA**
- [ ] Click "Accept" on assumption: PATCH fires, DB row status=accepted
- [ ] Hard reload: assumption shows accepted state (from DB, not localStorage)
- [ ] Click "Modify" with new value: DB shows modified_value and status=modified
- [ ] Inspect localStorage: no assumption keys present
- [ ] Incognito browser same project URL: shows correct assumption statuses (backend-driven)

**QA CHECKLIST**
- [ ] Accept assumption, hard reload, verify still accepted
- [ ] Reject assumption, open new tab same URL, verify still rejected
- [ ] Modify assumption value, reload, verify modified value shown
- [ ] DevTools Application > localStorage: zero assumption-related keys

**HANDOFF NOTES**
After this task localStorage is no longer the truth for assumptions. I6-QA will run the no-localStorage test. Coordinate with I6-QA to confirm test coverage.`,
            agent_role: 'frontend_engineer',
            task_type: 'code',
            priority: 'critical',
            estimated_cost_usd: 0.10,
            order_index: 2,
          },
        ],
      },

      // ── I3: Real Readiness Engine ─────────────────────────────────────────────
      {
        title: 'I3 — Real Readiness Engine',
        description: 'Replace the message-count heuristic (exchangeCount * 12, capped at 80) with a real readiness calculation driven by which required fields have been collected, how many are missing, and a confidence score from the collected data. Expose via GET /api/projects/[id]/wizard-readiness. Bind UI components to this endpoint.',
        priority: 'high',
        order_index: 3,
        tasks: [
          {
            title: 'I3-BE: Readiness calculation algorithm + wizard-readiness endpoint',
            description: `**OBJECTIVE**
Implement GET /api/projects/[id]/wizard-readiness that returns a real readiness score (0-100) based on collected_fields coverage, field confidence, and blueprint completeness.

**WHY IT MATTERS**
The current readiness bar shows Math.min(80, exchangeCount * 12) — a pure message-count heuristic. This means a user who gives one-word answers reads as 80% ready after 7 messages. Readiness must reflect what IRIS actually knows.

**STEP-BY-STEP IMPLEMENTATION**
1. Create: apps/web/src/app/api/projects/[id]/wizard-readiness/route.ts
2. GET handler logic:
   a. Load wizard_conversations.collected_fields for the project (admin client)
   b. Define REQUIRED_FIELDS with weights:
      \`\`\`ts
      const REQUIRED_FIELDS = [
        { key: 'product_name',    weight: 15, minLength: 3 },
        { key: 'target_audience', weight: 20, minLength: 10 },
        { key: 'core_problem',    weight: 25, minLength: 20 },
        { key: 'key_features',    weight: 20, minLength: 15 },
        { key: 'monetisation',    weight: 10, minLength: 3 },
        { key: 'timeline_weeks',  weight: 5,  minLength: 1 },
        { key: 'budget_usd',      weight: 5,  minLength: 1 },
      ] // total weight = 100
      \`\`\`
   c. For each field: score = weight if field present AND value.length >= minLength, else 0
   d. fieldScore = sum of all earned weights (0-100)
   e. confidenceBonus: if all 5 high-weight fields present AND total > 80, add up to +5 (capped at 100)
   f. Final readiness = Math.min(100, fieldScore + confidenceBonus)
   g. Also check: if wizard_conversations.trigger_fired = true, return 100
3. Return: { readiness: number, missing_fields: string[], collected_count: number, total_fields: 7 }
4. If no wizard_conversations row exists: return { readiness: 0, missing_fields: [...all], collected_count: 0 }

**AFFECTED FILES**
- apps/web/src/app/api/projects/[id]/wizard-readiness/route.ts (NEW)

**EXPECTED OUTPUT**
- No fields collected: readiness=0, missing_fields=[all 7]
- product_name + target_audience + core_problem collected: readiness=60
- All 7 fields collected with sufficient length: readiness=95-100

**EDGE CASES**
- Field present but value is empty string: treated as not collected (length check fails)
- trigger_fired=true: always return 100 regardless of field state
- Questionnaire exists but wizard_conversations missing: compute from questionnaire.answers as fallback

**ACCEPTANCE CRITERIA**
- [ ] Empty project: GET returns readiness=0
- [ ] Partial fields: readiness proportional to weight sum
- [ ] All fields: readiness >= 90
- [ ] trigger_fired=true: readiness=100
- [ ] missing_fields array always accurate

**QA CHECKLIST**
- [ ] Manually set collected_fields in DB with 3 of 7 fields, GET returns proportional score
- [ ] Set trigger_fired=true, GET returns 100
- [ ] Verify missing_fields lists only uncollected fields

**HANDOFF NOTES**
I3-FE depends on this endpoint. I5-BE also depends on this calculation logic — share the scoring function as a lib utility (src/lib/wizard-readiness.ts) so both can import it.`,
            agent_role: 'backend_engineer',
            task_type: 'code',
            priority: 'high',
            estimated_cost_usd: 0.08,
            order_index: 0,
            status: 'ready',
          },
          {
            title: 'I3-FE: Replace message-count heuristic — bind UI to real readiness',
            description: `**OBJECTIVE**
Remove the \`exchangeCount * 12\` heuristic from IrisWorkspace.tsx. Replace with a poll of GET /api/projects/[id]/wizard-readiness after each exchange. Update IrisStatusBar and IrisReadinessBar to display this real score.

**WHY IT MATTERS**
IrisStatusBar renders readiness to the user. If it shows 80% when IRIS only knows the product name, users trust a false signal. The bar must reflect actual information completeness.

**STEP-BY-STEP IMPLEMENTATION**
1. In IrisWorkspace.tsx, remove line:
   \`const newReadiness = complete ? 90 : Math.min(80, exchangeCount * 12)\`
2. Replace with an async function fetchReadiness():
   \`\`\`ts
   async function fetchReadiness() {
     const res = await fetch(\`/api/projects/\${projectId}/wizard-readiness\`)
     const json = await res.json()
     setReadiness(json.readiness ?? 0)
   }
   \`\`\`
3. Call fetchReadiness() after each completed IRIS exchange (same place readiness was previously set)
4. Call fetchReadiness() on mount (so returning users see correct readiness immediately)
5. On complete=true from IRIS: call fetchReadiness() one final time (will return 100 since trigger_fired will be set)
6. IrisReadinessBar.tsx: label thresholds are already correct (≥80 = "Ready to execute") — no changes needed there
7. IrisStatusBar.tsx: remove messageCount prop usage if it was only used to derive readiness display — or keep for "N exchanges" info only, never for readiness number

**AFFECTED FILES**
- apps/web/src/components/iris/IrisWorkspace.tsx (MODIFY)
- apps/web/src/components/iris/IrisStatusBar.tsx (MODIFY if needed)

**EXPECTED OUTPUT**
Readiness bar shows 0% for a new project. After each meaningful exchange where IRIS extracts a field, readiness ticks up. Shows 95%+ only when all major fields are collected.

**EDGE CASES**
- Fetch fails: keep existing readiness value, do not reset to 0
- Race: if two exchanges in flight, use latest response only (discard earlier)
- IrisChat path (production): IrisChat does not have a readiness bar — this is IrisWorkspace-specific

**ACCEPTANCE CRITERIA**
- [ ] New project: readiness bar shows 0%
- [ ] After product_name only: shows 15% (not 12% from message-count)
- [ ] After all fields collected: shows 90-100%
- [ ] No reference to exchangeCount in readiness calculation anywhere in codebase
- [ ] grep for "exchangeCount * 12" returns zero results

**QA CHECKLIST**
- [ ] grep codebase for "exchangeCount * 12" → zero results
- [ ] Open IrisWorkspace, send "I'm building a CRM" → readiness ticks to ~15%
- [ ] Continue until IRIS has all fields → readiness reaches 90%+
- [ ] Reload page → readiness bar shows correct backend value immediately

**HANDOFF NOTES**
This task is the user-visible proof of I3. After this lands, the readiness bar is a truthful signal. I6-QA will test correctness of displayed values vs DB values.`,
            agent_role: 'frontend_engineer',
            task_type: 'code',
            priority: 'high',
            estimated_cost_usd: 0.07,
            order_index: 1,
          },
        ],
      },

      // ── I4: Backend-Driven Preview ────────────────────────────────────────────
      {
        title: 'I4 — Backend-Driven Preview',
        description: 'Replace all frontend-fabricated preview structure in IrisPreviewPanel and IrisWorkspace with a backend draft preview. After each exchange, the backend extracts a structured preview from the IRIS conversation and stores it. The frontend fetches and renders this data.',
        priority: 'high',
        order_index: 4,
        tasks: [
          {
            title: 'I4-BE: Draft preview extractor + storage in wizard_conversations',
            description: `**OBJECTIVE**
After each IRIS exchange, extract a structured draft preview from the conversation and persist it in wizard_conversations.draft_preview (jsonb column). Expose it via GET /api/projects/[id]/draft-preview.

**WHY IT MATTERS**
IrisPreviewPanel currently generates a fake placeholder preview entirely client-side (lines 117-138 of IrisWorkspace.tsx). This fabricated structure looks real but contains no actual product information. The preview must be derived from what IRIS has actually learned.

**STEP-BY-STEP IMPLEMENTATION**
1. Add draft_preview jsonb column to wizard_conversations (migration amendment or new migration):
   \`\`\`sql
   ALTER TABLE wizard_conversations ADD COLUMN IF NOT EXISTS draft_preview jsonb;
   \`\`\`
2. Create: apps/web/src/lib/draft-preview-extractor.ts
   - Function extractDraftPreview(collected_fields: Record<string, string>): DraftPreview
   - DraftPreview shape:
     \`\`\`ts
     {
       title: string          // collected_fields.product_name or 'Untitled Product'
       description: string    // core_problem or 'Discovery in progress…'
       phases: Array<{ label: string, duration: string }>  // derived from key_features count
       assumptions: Array<{ id, label, value }>  // extracted from monetisation, ai_features, timeline, budget
       readiness: number      // from wizard-readiness calculation
       is_partial: boolean    // true if < 5 fields collected
     }
     \`\`\`
   - phases derivation: 1-2 features → 2 phases, 3-4 → 3 phases, 5+ → 4 phases
   - assumptions: always 4 cards: { tech_stack: "TBD", monetisation: value|"TBD", timeline: value|"TBD", team_size: "TBD" }
   - Fill with "TBD" or "Unknown" for uncollected fields — never fabricate specific values
3. In iris/route.ts, after each successful exchange (NOT just at completion):
   - If collected_fields has changed: call extractDraftPreview(collected_fields)
   - PATCH wizard_conversations SET draft_preview=result, updated_at=now()
4. Create: apps/web/src/app/api/projects/[id]/draft-preview/route.ts
   - GET: return wizard_conversations.draft_preview for project, or null

**AFFECTED FILES**
- apps/web/src/app/api/projects/[id]/iris/route.ts (MODIFY — persist draft_preview after each exchange)
- apps/web/src/app/api/projects/[id]/draft-preview/route.ts (NEW)
- apps/web/src/lib/draft-preview-extractor.ts (NEW)
- migrations/20260330000026_wizard_conversations_draft_preview.sql (NEW — add column)

**EXPECTED OUTPUT**
After each IRIS exchange: wizard_conversations.draft_preview updated with real extracted data. GET /draft-preview returns this data.

**EDGE CASES**
- First exchange: minimal data → is_partial:true, title from any detected product name
- No product_name yet: title = "Your Product"
- draft_preview null (not yet extracted): GET returns null (frontend shows empty state)

**ACCEPTANCE CRITERIA**
- [ ] After 1 exchange mentioning a product name: draft_preview.title = that name
- [ ] After 2 exchanges: phases count increases with feature mentions
- [ ] GET /draft-preview returns null for brand new project
- [ ] GET after 3 exchanges returns real extracted data, not null

**QA CHECKLIST**
- [ ] Send "I'm building a CRM called SalesOS", check wizard_conversations.draft_preview
- [ ] GET /draft-preview returns title="SalesOS"
- [ ] Hard reload, GET again — same data returned (persisted)

**HANDOFF NOTES**
I4-FE depends on this endpoint. Confirm GET returns correct structure before starting frontend work.`,
            agent_role: 'backend_engineer',
            task_type: 'code',
            priority: 'high',
            estimated_cost_usd: 0.10,
            order_index: 0,
            status: 'ready',
          },
          {
            title: 'I4-FE: IrisPreviewPanel — replace client fabrication with backend fetch',
            description: `**OBJECTIVE**
Remove the client-side preview generation from IrisWorkspace.tsx (lines 117-138 that create placeholder phases and assumptions). Replace with a fetch of GET /api/projects/[id]/draft-preview after each exchange. IrisPreviewPanel receives real backend data or shows the EMPTY state.

**WHY IT MATTERS**
The fabricated preview creates false confidence. A user sees "3 phases, 14 tasks" when IRIS hasn't even confirmed the product type yet. The preview must only show data IRIS actually collected.

**STEP-BY-STEP IMPLEMENTATION**
1. In IrisWorkspace.tsx, after each exchange reply received:
   - Call fetchDraftPreview() → GET /api/projects/{id}/draft-preview
   - If response.data is non-null: setPreviewData(response.data)
   - If null: setPreviewData(null) → IrisPreviewPanel renders EMPTY state
2. On mount: call fetchDraftPreview() to hydrate on reload
3. Remove all lines in IrisWorkspace.tsx that generate phases/assumptions client-side:
   - Search for "placeholder", "phases.push", "assumptions.push", "feature count" in IrisWorkspace
   - Delete fabrication code entirely
4. IrisPreviewPanel.tsx receives data: IrisPreviewData | null unchanged — no changes to panel component itself
5. Pass is_partial from backend data to IrisPreviewPanel — if is_partial:true, show "Discovery in progress…" label in the preview header

**AFFECTED FILES**
- apps/web/src/components/iris/IrisWorkspace.tsx (MODIFY — delete fabrication, add fetch)
- apps/web/src/components/iris/IrisPreviewPanel.tsx (MINOR MODIFY — render is_partial label)

**EXPECTED OUTPUT**
Before IRIS has any product info: preview panel shows EMPTY state (dashed circle, "Start chatting…" message). After first meaningful exchange: real extracted data appears. No fabricated phases or task counts.

**EDGE CASES**
- Fetch fails: keep existing preview data (don't blank the panel)
- is_partial=true: show banner "Blueprint preview — discovery in progress" in panel header
- is_partial=false (all fields collected): show full preview without banner

**ACCEPTANCE CRITERIA**
- [ ] New project, IrisWorkspace open: preview panel shows EMPTY state, not fake phases
- [ ] After mentioning product name + problem: preview shows those 2 real values
- [ ] grep for "placeholder" in IrisWorkspace.tsx → zero fabrication results
- [ ] Hard reload with existing draft: preview correctly restored from backend

**QA CHECKLIST**
- [ ] Open IrisWorkspace for new project: preview = EMPTY (no phases shown)
- [ ] Say "I'm building SalesOS, a CRM for SMBs": preview shows "SalesOS" title
- [ ] Hard reload: preview data persists (from backend, not localStorage)
- [ ] Inspect Network tab: GET /draft-preview fires after each reply

**HANDOFF NOTES**
After this task, frontend-fabricated preview is eliminated. I6-QA will test this by verifying no fabricated structure in the rendered panel before any IRIS response is received.`,
            agent_role: 'frontend_engineer',
            task_type: 'code',
            priority: 'high',
            estimated_cost_usd: 0.09,
            order_index: 1,
          },
        ],
      },

      // ── I5: Event/Confidence-Based Trigger ────────────────────────────────────
      {
        title: 'I5 — Event/Confidence-Based Trigger',
        description: 'Replace the message-count completion trigger in iris/route.ts with a confidence/sufficiency threshold check. IRIS must only emit COMPLETE_JSON when real field coverage reaches the threshold. Log the trigger reason so it is auditable.',
        priority: 'high',
        order_index: 5,
        tasks: [
          {
            title: 'I5-BE: Confidence threshold — replace COMPLETE_JSON trigger condition',
            description: `**OBJECTIVE**
Remove the implicit message-count trigger from IRIS. Ensure COMPLETE_JSON is only emitted by the LLM when genuine sufficiency is reached, enforced by a server-side completeness gate before accepting completion.

**WHY IT MATTERS**
The IRIS system prompt instructs the model to output COMPLETE_JSON when all 5 required areas are gathered. However there is no server-side enforcement: if the model emits COMPLETE_JSON prematurely, the wizard completes with an incomplete blueprint. This task adds a server-side gate.

**STEP-BY-STEP IMPLEMENTATION**
1. Import (or inline) the readiness scoring function from src/lib/wizard-readiness.ts (created in I3-BE):
   - computeReadiness(collected_fields) → number
2. In iris/route.ts, after parsing a COMPLETE_JSON match:
   a. Parse gathered fields from the JSON
   b. Compute readiness score: const score = computeReadiness(gathered)
   c. If score < 70 (threshold):
      - Do NOT set complete:true
      - Return a conversational reply: "I need a bit more detail on [missing_fields]. [Ask about first missing field]"
      - Do NOT save questionnaire answers yet
   d. If score >= 70: proceed with current completion flow
3. Log trigger reason: when proceeding with completion, set wizard_conversations.trigger_reason = \`confidence_threshold_met:score=\${score},fields=\${collected_count}/7\`
4. The IRIS system prompt already instructs not to emit COMPLETE_JSON prematurely — the gate is a defense layer, not the primary mechanism

**AFFECTED FILES**
- apps/web/src/app/api/projects/[id]/iris/route.ts (MODIFY)
- apps/web/src/lib/wizard-readiness.ts (NEW shared utility, created in I3-BE)

**EXPECTED OUTPUT**
IRIS cannot complete with score < 70. trigger_reason is logged in wizard_conversations row on completion.

**EDGE CASES**
- Model emits COMPLETE_JSON with only product_name gathered (score=15): server rejects, sends follow-up question
- Score exactly 70: threshold is met, proceed
- Score >= 70 but key field (core_problem) missing: consider adding a hard-required field check in addition to score gate

**ACCEPTANCE CRITERIA**
- [ ] Simulate early COMPLETE_JSON emission (mock or unit test): server returns follow-up question not complete:true
- [ ] Genuine completion: trigger_reason logged in wizard_conversations
- [ ] wizard_conversations.trigger_fired=true only when score >= 70

**QA CHECKLIST**
- [ ] Verify trigger_reason column populated after a real wizard completion
- [ ] Unit test: computeReadiness with 2 fields → below threshold
- [ ] Unit test: computeReadiness with all 7 fields → above threshold

**HANDOFF NOTES**
This task makes the trigger confidence-based rather than model-trust-based. Coordinate with I3-BE owner to ensure computeReadiness is exported from wizard-readiness.ts before this task begins.`,
            agent_role: 'backend_engineer',
            task_type: 'code',
            priority: 'high',
            estimated_cost_usd: 0.07,
            order_index: 0,
            status: 'ready',
          },
        ],
      },

      // ── I6: Reality QA ─────────────────────────────────────────────────────────
      {
        title: 'I6 — Reality QA',
        description: 'Comprehensive QA suite verifying: (1) reload persistence of all wizard state, (2) assumptions written to backend and not localStorage, (3) readiness correctness against DB values, (4) preview correctness against collected_fields, (5) E2E browser validation proving the full system is real.',
        priority: 'high',
        order_index: 6,
        tasks: [
          {
            title: 'I6-QA: Reload persistence test suite',
            description: `**OBJECTIVE**
Write and execute tests that prove wizard conversation state and assumption state survive a full page reload by reading from the backend, not localStorage.

**WHY IT MATTERS**
The phase acceptance criteria explicitly require: "reload restores wizard state from backend." Without a formal test, this is a verbal claim. Tests make it a verifiable fact.

**STEP-BY-STEP IMPLEMENTATION**
1. Create: apps/web/src/__tests__/wizard-persistence.test.ts (or .spec.ts)
2. Test cases:
   a. wizard_state_persistence:
      - Mock POST /wizard-state to record calls
      - Send exchange in IrisChat component (React Testing Library)
      - Verify POST was called with messages array
      - Unmount component, remount
      - Mock GET /wizard-state to return saved messages
      - Verify IrisChat renders prior messages without re-booting
   b. assumptions_persistence:
      - Render IrisAssumptionCards with 3 assumptions
      - Click "Accept" on first card
      - Verify PATCH /wizard-assumptions/{key} was called (not localStorage.setItem)
      - Unmount, remount
      - Mock GET /wizard-assumptions to return accepted status
      - Verify first card renders as accepted without localStorage read
3. Integration browser test (Playwright preferred, manual steps acceptable):
   - Navigate to /projects/{testProjectId}/onboarding (IrisWorkspace path)
   - Send 2 exchanges
   - Open DevTools > Application > localStorage
   - Verify no conversation keys present
   - Hard reload (Ctrl+Shift+R)
   - Verify 2 prior exchanges visible
   - Accept one assumption
   - Hard reload
   - Verify assumption still shown as accepted

**AFFECTED FILES**
- apps/web/src/__tests__/wizard-persistence.test.ts (NEW)

**EXPECTED OUTPUT**
All tests pass. localStorage inspection shows zero wizard conversation or assumption keys.

**EDGE CASES**
- Test environment: mock fetch calls, do not hit real Supabase
- Reload simulation: use component unmount + remount with mocked GET returning saved data

**ACCEPTANCE CRITERIA**
- [ ] All wizard-persistence tests pass in CI
- [ ] localStorage inspection in browser shows no wizard/assumption keys
- [ ] Reload at any point in conversation restores state

**QA CHECKLIST**
- [ ] npm test wizard-persistence → all pass
- [ ] Manual browser: DevTools > Application > localStorage → no iris/wizard/assumption keys
- [ ] Manual reload after 2 exchanges → messages restored
- [ ] Manual reload after assumption accept → acceptance persists

**HANDOFF NOTES**
This is the gating QA task for I1 and I2. Report pass/fail to phase supervisor before marking I1/I2 complete.`,
            agent_role: 'qa_engineer',
            task_type: 'test',
            priority: 'high',
            estimated_cost_usd: 0.08,
            order_index: 0,
            status: 'ready',
          },
          {
            title: 'I6-QA: Readiness correctness + preview correctness + E2E browser validation',
            description: `**OBJECTIVE**
Test that readiness values displayed match backend computed values, that preview data matches collected_fields in DB, and perform a complete E2E browser validation proving the full wizard pipeline is real.

**WHY IT MATTERS**
Readiness and preview are the two most visible "reality signals" to a user. If they show wrong values, the system appears trustworthy but isn't. These tests close the loop on the entire P9B-INTEGRATION v3 acceptance criteria.

**STEP-BY-STEP IMPLEMENTATION**
Part 1 — Readiness correctness:
1. Unit test: computeReadiness() function
   - Input: {} → output: 0
   - Input: { product_name: 'SalesOS' } → output: 15
   - Input: { product_name: 'X', target_audience: 'SMBs', core_problem: 'long desc here', key_features: 'CRM, pipeline, reports', monetisation: 'Subscription' } → output: 90
2. API test: GET /wizard-readiness
   - Set wizard_conversations.collected_fields to known test values
   - Verify returned readiness matches expected

Part 2 — Preview correctness:
1. Unit test: extractDraftPreview() function
   - No fields: { is_partial:true, title:'Your Product', phases:[] }
   - product_name + core_problem: is_partial:true, title=product_name, description=core_problem
   - All fields: is_partial:false, assumptions contain real values not "TBD"

Part 3 — E2E browser validation (manual or Playwright):
1. Open Chrome DevTools with Network tab open
2. Navigate to IrisWorkspace for a fresh test project
3. Verify:
   - readiness bar shows 0% (not a fake 12%)
   - preview panel shows EMPTY state (no fabricated phases)
   - localStorage has no wizard/iris/assumption keys
4. Type: "I want to build a B2B SaaS called SalesOS for SMB sales teams"
5. Verify after IRIS reply:
   - GET /draft-preview network call fired
   - GET /wizard-readiness network call fired
   - Preview shows "SalesOS" title (from backend, not fabricated)
   - Readiness shows ~15-35% (product_name + partial target_audience)
6. Accept one assumption card, verify:
   - PATCH /wizard-assumptions/{key} network call fired
   - NO localStorage.setItem call in console
7. Hard reload (Ctrl+Shift+R), verify:
   - Prior message visible
   - Assumption still accepted
   - Readiness bar shows same % as before reload
   - Preview shows same title as before reload

**AFFECTED FILES**
- apps/web/src/__tests__/wizard-readiness.test.ts (NEW)
- apps/web/src/__tests__/draft-preview-extractor.test.ts (NEW)

**EXPECTED OUTPUT**
All unit tests pass. Browser E2E validation proves: no localStorage truth, no fake preview, real readiness values, full reload persistence.

**ACCEPTANCE CRITERIA**
- [ ] computeReadiness unit tests all pass
- [ ] extractDraftPreview unit tests all pass
- [ ] E2E: browser Network tab shows /wizard-state, /wizard-readiness, /draft-preview calls
- [ ] E2E: localStorage empty of wizard data
- [ ] E2E: reload preserves conversation, assumption, readiness, preview

**QA CHECKLIST**
- [ ] Run npm test → all new test files pass
- [ ] Browser Network tab: /wizard-state POST fires after each exchange
- [ ] Browser Network tab: /wizard-readiness GET fires after each exchange
- [ ] Browser Network tab: /draft-preview GET fires after each exchange
- [ ] Browser Network tab: /wizard-assumptions PATCH fires on assumption action
- [ ] localStorage: empty of all wizard-related keys
- [ ] Full reload: all state restored from backend

**HANDOFF NOTES**
This is the final gate task for P9B-INTEGRATION v3. Report results to phase supervisor. Phase is accepted only if all E2E checks above pass in browser.`,
            agent_role: 'qa_engineer',
            task_type: 'test',
            priority: 'high',
            estimated_cost_usd: 0.10,
            order_index: 1,
          },
        ],
      },

    ],
  },
]

export const ROADMAP_P9B_INTEGRATION_V3_SUMMARY = {
  total_epics: 1,
  total_features: 6,
  total_tasks: 19,
  workstreams: ['I1', 'I2', 'I3', 'I4', 'I5', 'I6'],
  estimated_total_cost_usd: 0.05 + 0.08 + 0.10 + 0.08 + 0.04 + 0.09 + 0.10 + 0.08 + 0.07 + 0.10 + 0.07 + 0.10 + 0.09 + 0.07 + 0.08 + 0.10,
}
