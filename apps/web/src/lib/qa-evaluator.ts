/**
 * Block G10: Real QA Evaluator â Fail-by-Default Multi-Layer Validation
 *
 * G10 REBUILD: Replaces pattern-matching rubber-stamp with evidence-backed checks.
 * Core change: FAIL-BY-DEFAULT â if QA cannot prove correctness, verdict = FAIL.
 * ANY check that is explicitly false â FAIL immediately (no auto-pass path).
 *
 * Multi-layer checks:
 *   A) compilation_passed:     TypeScript syntax / error-marker check
 *   B) contract_check_passed:  import/export / route contract validation
 *   C) schema_check_passed:    DB table reference validation (RULE-27)
 *   D) requirement_match_passed: output matches task objective
 *
 * Verdict rules (G10):
 *   ANY layer === false â FAIL
 *   ALL non-null layers === true â PASS (score â¥ PASS_THRESHOLD)
 *   score in [RETRY_THRESHOLD, PASS_THRESHOLD) â RETRY_REQUIRED
 *   otherwise â FAIL
 *
 * LIMITATIONS (per QA-Gate-Protocol.md Â§13):
 * - tsc --noEmit cannot run on raw text in Vercel serverless; pattern-based analysis used.
 * - DB schema validation uses known table list; cannot query live schema at eval time.
 * - Code is not executed; runtime behavior cannot be verified.
 *
 * Evaluator model: buildos-qa-evaluator-v2 (G10 multi-layer)
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ââ Task type classification ââââââââââââââââââââââââââââââââââââââââââââââââ

const CODE_TASK_TYPES = new Set([
  'code', 'schema', 'test', 'implementation', 'migration',
])

const CODE_AGENT_ROLES = new Set([
  'frontend_engineer', 'backend_engineer', 'infrastructure_engineer',
])

// ââ Task types that use SCAFFOLD evaluation mode (P7.6) âââââââââââââââââââââââ
// Scaffold tasks create project structure â they do NOT reference DB tables,
// do NOT have route/export contracts, and MUST NOT be blocked by RULE-27.
const SCAFFOLD_TASK_TYPES = new Set([
  'scaffold', 'system_init', 'init', 'project_init', 'bootstrap',
])

// ââ Task types that use TEST evaluation mode (P7.6) âââââââââââââââââââââââââââ
const TEST_TASK_TYPES = new Set([
  'test', 'spec', 'unit_test', 'integration_test',
])

// ââ Known BuildOS database tables (RULE-27 schema validation) ââââââââââââââââ
// Used to detect invalid table references in agent output.
// Any .from('name') or INSERT INTO name referencing a non-existent table â FAIL.

const KNOWN_BUILDOS_TABLES = new Set([
  // Core pipeline
  'projects', 'epics', 'features', 'tasks', 'task_runs',
  'agent_outputs', 'resource_locks', 'idempotency_keys', 'audit_logs',
  // Governance G1-G5
  'incidents', 'prevention_rules',
  'qa_verdicts', 'qa_results',
  'task_events', 'handoff_events', 'settings_changes',
  'release_gate_checks', 'manual_override_log',
  // Cost
  'cost_events', 'cost_models',
  // Documents / integrations
  'documents', 'routing_decisions', 'shadow_results',
  // G4 commit reliability (actual table name)
  'task_delivery_gates',
  // Auth / users (Supabase)
  'users', 'profiles',
  // Other known tables
  'blockers', 'workspaces', 'wizard_state',
  // Orchestration
  'orchestration_runs', 'project_settings', 'orchestration_config',
  // U1-B: Connections & Integrations layer + Supabase migration tables
  'schema_registry',  // Supabase integration â tracks schema objects for migration
  'provider_connections', 'project_integrations', 'integration_providers',
  'workspace_connections', 'credentials', 'integration_credentials',
  'integration_scopes', 'integration_assignments',
  'integration_environments', 'integration_environment_credentials',
  'project_credentials', 'environment_credentials',
  // G4 delivery + governance
  'commit_delivery_logs', 'incident_logs', 'generation_events',
  // Misc
  'profiles', 'user_profiles', 'workspace_members', 'workspace_invites',
  'migration_ledger', 'api_keys',
  // Synced from BUILDOS_SCHEMA_SNAPSHOT (Railway) â tables Railway agents are told exist
  // Multi-tenant / membership
  'organizations', 'organization_members', 'project_members',
  // Project & blueprint metadata
  'project_files', 'project_environments', 'project_tech_stack_items',
  'blueprints', 'blueprint_features', 'blueprint_stack_recommendations',
  'questionnaires', 'artifacts',
  // Pipeline internals
  'job_queue', 'task_dependencies', 'worker_heartbeats', 'retry_logs',
  'dead_letter_queue', 'blocked_reason_codes',
  // Governance & delivery
  'architecture_decisions', 'api_contracts',
  'delivery_checkpoints', 'release_readiness', 'gate_policies',
  'incident_fixes', 'incident_root_causes', 'system_incidents',
  'reconciliation_events', 'state_ownership_registry',
  // Cost & recommendations
  'cost_estimates', 'recommendation_items', 'recommendation_reports',
  // Infra
  'deployment_targets', 'cutover_flags', 'file_locks',
  'jsonb_output_schemas',
])

// ââ WS1 Phase 6.2: Schema replacement map â actionable QA corrections ââââââââ
// When agent output references an unknown table, this map provides the correct
// BuildOS table to use. Enables WRONG_SCHEMA_WITH_FIX classification so the
// system can auto-requeue the task with the corrected suggestion instead of
// just emitting a generic FAIL that requires manual override (WA-2).
//
// Key   = what the agent incorrectly used
// Value = what the agent should have used instead

const TABLE_REPLACEMENT_MAP: Record<string, string> = {
  // task execution
  agent_jobs: 'task_runs',
  jobs: 'task_runs',
  job_runs: 'task_runs',
  run_logs: 'task_runs',
  execution_logs: 'audit_logs',
  pipeline_runs: 'orchestration_runs',
  pipeline_tasks: 'tasks',
  agent_tasks: 'tasks',
  // agent output
  task_results: 'agent_outputs',
  agent_results: 'agent_outputs',
  execution_results: 'agent_outputs',
  outputs: 'agent_outputs',
  // integrations / connections
  connections: 'provider_connections',
  integrations: 'project_integrations',
  providers: 'integration_providers',
  // QA
  qa_checks: 'qa_verdicts',
  qa_records: 'qa_results',
  quality_checks: 'qa_verdicts',
  // governance
  overrides: 'manual_override_log',
  override_log: 'manual_override_log',
  events: 'task_events',
  // locks / idempotency
  locks: 'resource_locks',
  task_locks: 'resource_locks',
  // users / profiles
  users_profiles: 'profiles',
  user_settings: 'project_settings',
  app_settings: 'project_settings',
  // blockers
  task_blockers: 'blockers',
  project_blockers: 'blockers',
  errors: 'incidents',
  failures: 'incidents',
  // delivery / commits
  delivery_logs: 'commit_delivery_logs',
  commit_logs: 'commit_delivery_logs',
  github_commits: 'commit_delivery_logs',
  task_deliveries: 'task_delivery_gates',
  deliveries: 'task_delivery_gates',
  checkpoints: 'delivery_checkpoints',
  // project meta
  recommendations: 'recommendation_items',
  tech_stack: 'project_tech_stack_items',
  stack_items: 'project_tech_stack_items',
  environments: 'project_environments',
  files: 'project_files',
  // membership
  members: 'organization_members',
  invites: 'workspace_invites',
}

// ââ WS1 Phase 6.2: Fail classification constants âââââââââââââââââââââââââââââ
// Returned in QAEvaluationResult.fail_classification to enable auto-requeue logic.

export type QAFailClassification =
  | 'WRONG_SCHEMA_WITH_FIX'   // unknown table but known replacement exists â auto-requeue
  | 'WRONG_SCHEMA_NO_FIX'     // unknown table, no replacement known â manual review
  | 'WRONG_STACK'             // forbidden package import
  | 'EMPTY_OUTPUT'            // agent produced nothing
  | 'TOO_SHORT'               // output below minimum length
  | 'NO_CODE_STRUCTURE'       // output lacks TS/JS keywords
  | 'CONTRACT_VIOLATION'      // missing export / HTTP method
  | 'REQUIREMENT_MISMATCH'    // key terms missing from output
  | null                      // PASS or no specific classification

// ââ WS1 HARDENING: Forbidden packages â permanent stack discipline ââââââââââââ
// Any agent output IMPORTING these packages is an automatic FAIL (WRONG_STACK).
// These packages are NOT installed and MUST NOT be used in this codebase.
// Correct alternatives: @supabase/ssr, createAdminSupabaseClient from @/lib/supabase/server
//
// IMPORTANT: We check for ACTUAL IMPORTS only, not string occurrences.
// A validator file that lists 'next-auth' in a FORBIDDEN_PACKAGES constant is valid code.
// We must not false-positive on string literals, comments, or variable declarations.

// Import-pattern regexes: match only actual import/require statements, NOT string literals.
const FORBIDDEN_IMPORT_PATTERNS: Array<[string, RegExp]> = [
  // next-auth
  ['next-auth', /^\s*import\s+.*from\s+['"]next-auth/m],
  ['next-auth', /require\s*\(\s*['"]next-auth/],
  // prisma
  ['prisma/@prisma/client', /^\s*import\s+.*from\s+['"]@?prisma/m],
  ['prisma/@prisma/client', /require\s*\(\s*['"]@?prisma/],
  ['PrismaClient', /new\s+PrismaClient\s*\(/],
  ['prisma.', /\bprisma\.(user|post|session|account|project)\./],  // prisma ORM method calls
  // Supabase auth-helpers (legacy â replaced by @supabase/ssr)
  ['@supabase/auth-helpers-nextjs', /from\s+['"]@supabase\/auth-helpers/],
  ['@supabase/auth-helpers-nextjs', /require\s*\(\s*['"]@supabase\/auth-helpers/],
  ['createClientComponentClient', /\bcreateClientComponentClient\s*\(/],
  ['createServerComponentClient', /\bcreateServerComponentClient\s*\(/],
  ['createMiddlewareClient', /\bcreateMiddlewareClient\s*\(/],
]

function checkForbiddenPackages(output: string): {
  hasForbidden: boolean
  detected: string[]
} {
  const detected: string[] = []
  for (const [label, pattern] of FORBIDDEN_IMPORT_PATTERNS) {
    if (pattern.test(output) && !detected.includes(label)) {
      detected.push(label)
    }
  }
  return { hasForbidden: detected.length > 0, detected }
}

// ââ WS2 HARDENING: Protected files â prevent agent overwrite âââââââââââââââââ
// If agent output explicitly names these files as "create" or "replace" targets,
// flag as PROTECTED_FILE_VIOLATION. Agents must never rewrite these.

const PROTECTED_FILES = [
  'supabase/server.ts',
  'lib/supabase/server',
  'middleware.ts',
  'lib/types.ts',
  'lib/types/index.ts',
]

// ââ G10: Failure markers that indicate compilation/runtime errors âââââââââââââ

const COMPILATION_FAILURE_MARKERS = [
  'SyntaxError:',
  'Cannot find module',
  'COMPILATION_ERROR',
  'BUILD_FAILED',
  'TypeError: Cannot',
  'ReferenceError:',
  'Module not found:',
  'Failed to compile',
  'Unexpected token',
  'unterminated string',
  'Unexpected end of JSON',
  'is not defined',
  'Cannot read propert',
  'ENOENT: no such file',
  'TS2304:', // TypeScript: Cannot find name
  'TS2305:', // TypeScript: Module has no exported member
  'TS2307:', // TypeScript: Cannot find module
  'TS2345:', // TypeScript: Argument type mismatch
  'TS2551:', // TypeScript: Property does not exist (did you mean...)
]

// Minimum output lengths to pass (G10: stricter thresholds)
const MIN_CODE_LENGTH = 300      // Raised from 200 â real code must be substantial
const MIN_NON_CODE_LENGTH = 150  // Raised from 100 â non-code must show real work

// Score thresholds
const PASS_THRESHOLD = 70
const RETRY_THRESHOLD = 50

// QA evaluator model identifier
const EVALUATOR_MODEL = 'buildos-qa-evaluator-v2'

// Escalation: if retry_count >= this, create incident linkage
const ESCALATION_RETRY_THRESHOLD = 2

// ââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export type QAVerdict = 'PASS' | 'FAIL' | 'RETRY_REQUIRED' | 'BLOCKED'

// P7.6: Evaluation mode â returned with every result
export type QAEvaluationMode = 'scaffold' | 'feature' | 'test'

export interface QAEvaluationInput {
  task_id: string
  project_id: string | null
  task_type: string
  agent_role: string
  title: string
  description: string | null
  retry_count: number
  max_retries: number
  raw_output: string | null
  // PX-2: Platform-specific allowed tables (extends KNOWN_BUILDOS_TABLES for non-saas projects)
  platform_tables?: Set<string>
}

export interface QAEvaluationResult {
  verdict: QAVerdict
  score: number
  qa_type: 'code' | 'non_code'
  compilation_passed: boolean | null
  contract_check_passed: boolean | null
  schema_check_passed: boolean | null        // G10: NEW â RULE-27 DB table validation
  requirement_match_passed: boolean | null
  notes: string
  evidence_summary: string
  evaluator_model: string
  retry_recommended: boolean
  feedback_for_task: string
  suggestion_for_task: string
  escalate_to_incident: boolean
  // WS1 Phase 6.2: actionable correction fields
  fail_classification: QAFailClassification  // enables auto-requeue when fix is deterministic
  schema_corrections: Record<string, string> // { wrongTable: 'correctTable' } for auto-fix
  // P7.6: evaluation mode and skipped rules
  mode_used: QAEvaluationMode    // 'scaffold' | 'feature' | 'test'
  skipped_rules: string[]        // rules not applied due to evaluation mode
}

// ââ G10: Extract DB table references from output text ââââââââââââââââââââââââ
// Matches patterns like:
//   .from('tableName')         â Supabase client
//   .from("tableName")         â Supabase client (double quotes)
//   INSERT INTO tableName      â SQL
//   SELECT ... FROM tableName  â SQL
//   UPDATE tableName           â SQL
//   DELETE FROM tableName      â SQL
//   admin.from('tableName')    â admin client

function extractTableReferences(output: string): string[] {
  const tables = new Set<string>()

  // Supabase .from('table') and .from("table")
  const supabasePattern = /\.from\(['"]([a-z_][a-z0-9_]*)['"](?:\s*,|\s*\))/g
  let m: RegExpExecArray | null
  while ((m = supabasePattern.exec(output)) !== null) {
    tables.add(m[1])
  }

  // Also catch .from('table') without comma/paren immediately after (end of line)
  const supabasePattern2 = /\.from\(['"]([a-z_][a-z0-9_]*)['"]\)/g
  while ((m = supabasePattern2.exec(output)) !== null) {
    tables.add(m[1])
  }

  // G10 FIX v8: SQL pattern table extraction DISABLED â too many false positives.
  // PostgreSQL functions (jsonb_each_text, unnest), system tables (pg_constraint,
  // information_schema), variable names, and common English words all pattern-match
  // against SQL keywords. Only Supabase .from('table') is reliable enough.
  // SQL patterns previously used: INSERT INTO, FROM, UPDATE SET, DELETE FROM
  const sqlPatterns: RegExp[] = [] // disabled

  for (const pattern of sqlPatterns) {
    pattern.lastIndex = 0
    while ((m = pattern.exec(output)) !== null) {
      const name = m[1].toLowerCase()
      // Skip SQL keywords and English stop words that pattern-match as table names
      // G10 FIX: 'the', 'a', 'an', 'this', 'that', 'each', 'both', 'all' added to prevent
      // natural-language prose (e.g. "updates from the task_runs table") from triggering
      // false-positive schema failures.
      // G10 FIX v2: also exclude technical terms that appear after FROM in TS/JS/English prose
      // but are NOT DB table names (vault, process, supabase, env, module, storage, etc.)
      if (!['select', 'where', 'join', 'left', 'right', 'inner', 'outer', 'on', 'and', 'or', 'null', 'not',
             'the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'both', 'all', 'any', 'its',
             'their', 'which', 'with', 'from', 'into', 'onto', 'over', 'under', 'after', 'before',
             // Technical terms false-positived as table names in TS/code output
             'vault', 'process', 'supabase', 'env', 'module', 'storage', 'cache', 'config',
             'database', 'db', 'client', 'server', 'api', 'auth', 'user', 'token', 'secret',
             'decrypted_secrets', 'encrypted_secrets', 'raw', 'data', 'result', 'response',
             'request', 'context', 'service', 'provider', 'connector', 'adapter',
             'error', 'exception', 'handler', 'middleware', 'function', 'class', 'interface',
             'type', 'export', 'import', 'return', 'await', 'async', 'const', 'let', 'var',
             'true', 'false', 'undefined', 'null', 'new', 'this', 'super', 'void',
             // G10 FIX v3/v5: additional common false-positives from integration-related output
             'url', 'uri', 'path', 'host', 'port', 'key', 'value', 'id', 'name', 'code',
             'body', 'head', 'form', 'query', 'params', 'props', 'state', 'ref',
             'list', 'map', 'set', 'string', 'number', 'boolean',
             'input', 'output', 'payload', 'schema', 'model', 'entity', 'record',
             'row', 'column', 'field', 'item', 'element', 'entry',
             'index', 'hash', 'scope', 'role', 'mode', 'status', 'stage',
             'base', 'root', 'tree', 'branch', 'leaf',
             // G10 FIX v5: more false-positives from OAuth/integration agent output
             'public', 'authorization', 'creating', 'metadata', 'connection',
             'vercel', 'github', 'supabase', 'oauth', 'redirect', 'callback',
             'access', 'refresh', 'bearer', 'header', 'scope', 'grant',
             'workspace', 'organization', 'team', 'member', 'account',
             // G10 FIX v6: PostgreSQL system objects and SQL functions
             'information_schema', 'pg_catalog', 'pg_tables', 'pg_namespace',
             'unnest', 'generate_series', 'row_to_json', 'array_agg', 'json_agg',
             'backup', 'temp', 'tmp', 'staging', 'archive', 'log', 'logs',
             'current', 'previous', 'next', 'last', 'first',
             'insert', 'update', 'delete', 'create', 'drop', 'alter', 'truncate',
             'values', 'returning', 'conflict', 'excluded', 'nothing',
             // G10 FIX v7: English words appearing after SQL keywords (FROM X, UPDATE X)
             'existing', 'options', 'environment', 'environments', 'integration',
             'integrations', 'credentials_map', 'environment_map', 'credential_map',
             'entries', 'mapping', 'config_map', 'settings_map', 'targets',
             'results', 'records', 'items', 'objects', 'nodes', 'edges'].includes(name)) {
        tables.add(name)
      }
    }
  }

  return Array.from(tables)
}

// ââ G10: Validate table references against known BuildOS schema âââââââââââââââ

function checkSchemaReferences(
  output: string,
  description: string | null,
  platformTables?: Set<string>,
): {
  passed: boolean | null
  referenced_tables: string[]
  unknown_tables: string[]
  detail: string
  // WS1 Phase 6.2: replacements for auto-requeue when fix is deterministic
  corrections: Record<string, string>  // { wrongTable: correctTable }
  has_deterministic_fix: boolean       // true when ALL unknown tables have a known replacement
} {
  const referenced = extractTableReferences(output)

  if (referenced.length === 0) {
    // No DB references found â schema check not applicable
    return {
      passed: null,
      referenced_tables: [],
      unknown_tables: [],
      detail: 'No DB table references detected in output â schema check skipped',
      corrections: {},
      has_deterministic_fix: false,
    }
  }

  // PX-2: Merge platform-specific tables with the BuildOS core tables so that
  // non-saas projects (ai_newsletter, marketplace, crm, â¦) don't get RULE-27
  // false-positives for their own domain tables (subscribers, campaigns, etc.)
  const allowedTables = platformTables
    ? new Set([...KNOWN_BUILDOS_TABLES, ...platformTables])
    : KNOWN_BUILDOS_TABLES

  const unknown = referenced.filter(t => !allowedTables.has(t.toLowerCase()))

  if (unknown.length > 0) {
    // WS1 Phase 6.2: look up actionable replacements for each unknown table
    const corrections: Record<string, string> = {}
    const noFix: string[] = []
    for (const table of unknown) {
      const replacement = TABLE_REPLACEMENT_MAP[table.toLowerCase()]
      if (replacement) {
        corrections[table] = replacement
      } else {
        noFix.push(table)
      }
    }
    const has_deterministic_fix = noFix.length === 0 && Object.keys(corrections).length > 0

    // Build actionable detail message
    const correctionHints = Object.entries(corrections)
      .map(([wrong, correct]) => `use '${correct}' instead of '${wrong}'`)
      .join('; ')
    const noFixHints = noFix.length > 0 ? ` No replacement known for: ${noFix.join(', ')}.` : ''
    const classTag = has_deterministic_fix ? '[WRONG_SCHEMA_WITH_FIX]' : '[WRONG_SCHEMA_NO_FIX]'

    return {
      passed: false,
      referenced_tables: referenced,
      unknown_tables: unknown,
      detail: correctionHints
        ? `FAIL schema ${classTag}: Unknown table(s): ${unknown.join(', ')}. Actionable fix: ${correctionHints}.${noFixHints}`
        : `FAIL schema ${classTag}: Output references unknown DB table(s): ${unknown.join(', ')}. Known tables must be used (RULE-27).${noFixHints}`,
      corrections,
      has_deterministic_fix,
    }
  }

  return {
    passed: true,
    referenced_tables: referenced,
    unknown_tables: [],
    detail: `PASS schema: All ${referenced.length} referenced table(s) are valid BuildOS tables: ${referenced.join(', ')}`,
    corrections: {},
    has_deterministic_fix: false,
  }
}

// ââ G10: Main evaluator âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function evaluateQA(input: QAEvaluationInput): QAEvaluationResult {
  const { task_type, agent_role, title, description, raw_output, retry_count, platform_tables } = input

  // ââ P7.6: Determine evaluation mode FIRST âââââââââââââââââââââââââââââââââ
  // Scaffold tasks get SCAFFOLD mode â no schema/contract checks.
  // Detection uses task_type AND title keywords because wizard-generated scaffold
  // tasks may arrive as type='implementation' with title="Initialize Next.js 14...".
  const isScaffoldTask = SCAFFOLD_TASK_TYPES.has(task_type)
    || /\b(initialize|scaffold|init(?:ialize)?)\b.*\b(project|app|next\.?js|repo|codebase|typescript)\b/i.test(title)
    || /\b(create|setup|bootstrap)\b.*\b(next\.?js|typescript|project|app|scaffold)\b/i.test(title)
  const isTestTask = !isScaffoldTask && TEST_TASK_TYPES.has(task_type)
  const evaluationMode: QAEvaluationMode = isScaffoldTask ? 'scaffold'
    : isTestTask ? 'test'
    : 'feature'

  // Determine task category
  const isCodeTask = CODE_TASK_TYPES.has(task_type) || CODE_AGENT_ROLES.has(agent_role)
  const qa_type: 'code' | 'non_code' = isCodeTask ? 'code' : 'non_code'

  const output = (raw_output || '').trim()

  // ââ P7.6: SCAFFOLD MODE â context-aware evaluation âââââââââââââââââââââââââââ
  // Scaffold tasks build project structure (files, routes, configs).
  // MUST NOT be evaluated against feature-level rules:
  //   SKIP: RULE-27 schema check  (no DB tables in scaffold output)
  //   SKIP: contract/export check (no route contract required)
  //   KEEP: forbidden packages    (no forbidden imports ever allowed)
  //   KEEP: compilation check     (no syntax errors allowed)
  //   KEEP: requirement match     (output must address task subject)

  if (isScaffoldTask) {
    const skippedRules = ['RULE-27 schema validation', 'contract/export check']
    const scaffoldNotes: string[] = [
      `[P7.6] SCAFFOLD mode â task_type=${task_type}, evaluation_mode=scaffold`,
      `[P7.6] Skipped rules: ${skippedRules.join(', ')}`,
    ]

    // Empty output check
    if (!output || output.length === 0) {
      return {
        verdict: 'FAIL', score: 0, qa_type,
        compilation_passed: false, contract_check_passed: null,
        schema_check_passed: null, requirement_match_passed: false,
        notes: [...scaffoldNotes, 'FAIL[scaffold]: Empty output'].join('\n'),
        evidence_summary: JSON.stringify({ scaffold_mode: true, empty: true }),
        evaluator_model: EVALUATOR_MODEL, retry_recommended: false,
        feedback_for_task: 'QA FAIL (scaffold): Agent produced empty output.',
        suggestion_for_task: 'Ensure the scaffold agent produces actual file content.',
        escalate_to_incident: retry_count >= ESCALATION_RETRY_THRESHOLD,
        fail_classification: 'EMPTY_OUTPUT', schema_corrections: {},
        mode_used: evaluationMode, skipped_rules: skippedRules,
      }
    }

    // Forbidden packages check
    const forbiddenResult = checkForbiddenPackages(output)
    if (forbiddenResult.hasForbidden) {
      const detected = forbiddenResult.detected.slice(0, 3).join(', ')
      return {
        verdict: 'FAIL', score: 0, qa_type,
        compilation_passed: false, contract_check_passed: null,
        schema_check_passed: null, requirement_match_passed: false,
        notes: [...scaffoldNotes, `FAIL[WRONG_STACK]: Forbidden packages in scaffold: ${detected}`].join('\n'),
        evidence_summary: JSON.stringify({ scaffold_mode: true, forbidden_packages: forbiddenResult.detected }),
        evaluator_model: EVALUATOR_MODEL, retry_recommended: false,
        feedback_for_task: `QA FAIL (WRONG_STACK): Forbidden package(s) in scaffold: ${detected}.`,
        suggestion_for_task: 'Remove forbidden imports. Scaffold must not use next-auth, prisma, or auth-helpers.',
        escalate_to_incident: retry_count >= ESCALATION_RETRY_THRESHOLD,
        fail_classification: 'WRONG_STACK', schema_corrections: {},
        mode_used: evaluationMode, skipped_rules: skippedRules,
      }
    }

    // Compilation: no error markers
    const failureMarker = COMPILATION_FAILURE_MARKERS.find(m => output.includes(m))
    if (failureMarker) {
      return {
        verdict: 'FAIL', score: 10, qa_type,
        compilation_passed: false, contract_check_passed: null,
        schema_check_passed: null, requirement_match_passed: null,
        notes: [...scaffoldNotes, `FAIL compilation[scaffold]: Error marker "${failureMarker}"`].join('\n'),
        evidence_summary: JSON.stringify({ scaffold_mode: true, compilation_failure_marker: failureMarker }),
        evaluator_model: EVALUATOR_MODEL, retry_recommended: false,
        feedback_for_task: `QA FAIL (scaffold): Compilation error: ${failureMarker}`,
        suggestion_for_task: 'Fix the error marker in the scaffold output and retry.',
        escalate_to_incident: retry_count >= ESCALATION_RETRY_THRESHOLD,
        fail_classification: 'NO_CODE_STRUCTURE', schema_corrections: {},
        mode_used: evaluationMode, skipped_rules: skippedRules,
      }
    }

    // Minimum length (relaxed to 200 for scaffold)
    const SCAFFOLD_MIN = 200
    if (output.length < SCAFFOLD_MIN) {
      return {
        verdict: 'FAIL', score: 15, qa_type,
        compilation_passed: false, contract_check_passed: null,
        schema_check_passed: null, requirement_match_passed: false,
        notes: [...scaffoldNotes, `FAIL[scaffold]: Output too short (${output.length} < ${SCAFFOLD_MIN})`].join('\n'),
        evidence_summary: JSON.stringify({ scaffold_mode: true, output_length: output.length }),
        evaluator_model: EVALUATOR_MODEL, retry_recommended: false,
        feedback_for_task: `QA FAIL (scaffold): Output too short (${output.length} chars). Must produce real file content.`,
        suggestion_for_task: 'Ensure scaffold output includes actual files (package.json, tsconfig, etc.).',
        escalate_to_incident: retry_count >= ESCALATION_RETRY_THRESHOLD,
        fail_classification: 'TOO_SHORT', schema_corrections: {},
        mode_used: evaluationMode, skipped_rules: skippedRules,
      }
    }

    // Requirement match (relaxed: 1 key term sufficient for scaffold)
    const scaffoldTitleWords = extractKeyTerms(title)
    const scaffoldOutputLower = output.toLowerCase()
    const scaffoldMatched = scaffoldTitleWords.filter(w => scaffoldOutputLower.includes(w.toLowerCase()))
    if (scaffoldTitleWords.length > 0 && scaffoldMatched.length === 0) {
      return {
        verdict: 'FAIL', score: 20, qa_type,
        compilation_passed: true, contract_check_passed: null,
        schema_check_passed: null, requirement_match_passed: false,
        notes: [...scaffoldNotes, `FAIL requirement_match[scaffold]: 0/${scaffoldTitleWords.length} key terms found`].join('\n'),
        evidence_summary: JSON.stringify({ scaffold_mode: true, key_terms: scaffoldTitleWords, matched: scaffoldMatched }),
        evaluator_model: EVALUATOR_MODEL, retry_recommended: false,
        feedback_for_task: 'QA FAIL (scaffold): Output does not address the scaffold task objective.',
        suggestion_for_task: `Ensure output mentions: ${scaffoldTitleWords.slice(0, 3).join(', ')}.`,
        escalate_to_incident: retry_count >= ESCALATION_RETRY_THRESHOLD,
        fail_classification: 'REQUIREMENT_MISMATCH', schema_corrections: {},
        mode_used: evaluationMode, skipped_rules: skippedRules,
      }
    }

    // SCAFFOLD PASS
    scaffoldNotes.push(`PASS[scaffold]: No forbidden packages, no compilation errors, length=${output.length}`)
    scaffoldNotes.push(`VERDICT[scaffold]: PASS â schema+contract checks skipped by design (P7.6)`)
    return {
      verdict: 'PASS', score: 90, qa_type,
      compilation_passed: true, contract_check_passed: null,
      schema_check_passed: null, requirement_match_passed: true,
      notes: scaffoldNotes.join('\n'),
      evidence_summary: JSON.stringify({ scaffold_mode: true, output_length: output.length, skipped_rules: skippedRules }),
      evaluator_model: EVALUATOR_MODEL, retry_recommended: false,
      feedback_for_task: '',
      suggestion_for_task: '',
      escalate_to_incident: false,
      fail_classification: null, schema_corrections: {},
      mode_used: evaluationMode, skipped_rules: skippedRules,
    }
  }

  // ââ G10 FAIL-BY-DEFAULT: empty or missing output â immediate FAIL ââââââââââ

  if (!output || output.length === 0) {
    return {
      ...buildResult({
        qa_type,
        verdict: 'FAIL',
        score: 0,
        compilation_passed: isCodeTask ? false : null,
        contract_check_passed: null,
        schema_check_passed: null,
        requirement_match_passed: false,
        noteLines: ['FAIL[G10]: Output is empty. No content produced by agent. FAIL-BY-DEFAULT applies.'],
        evidence: { empty: true, length: 0, fail_by_default: true, evaluation_mode: evaluationMode },
        feedback: 'QA FAIL (G10): Agent produced empty output. Task must be re-attempted.',
        suggestion: 'Ensure the agent produces actual content. Verify the task description is actionable.',
        retry_count,
        fail_classification: 'EMPTY_OUTPUT',
        schema_corrections: {},
      }),
      mode_used: evaluationMode,
      skipped_rules: [],
    }
  }

  // ââ Run all checks âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const noteLines: string[] = []
  const evidence: Record<string, unknown> = {
    output_length: output.length,
    qa_type,
    evaluator: EVALUATOR_MODEL,
    g10_fail_by_default: true,
    evaluation_mode: evaluationMode,  // P7.6
  }

  let compilation_passed: boolean | null = null
  let contract_check_passed: boolean | null = null
  let schema_check_passed: boolean | null = null
  let requirement_match_passed: boolean | null = null

  // ââ A. Compilation check (code tasks only) ââââââââââââââââââââââââââââââââ

  if (isCodeTask) {
    const failureMarker = COMPILATION_FAILURE_MARKERS.find(m => output.includes(m))
    const tooShort = output.length < MIN_CODE_LENGTH

    if (failureMarker) {
      compilation_passed = false
      noteLines.push(`FAIL compilation[G10]: Output contains error marker: "${failureMarker}"`)
      evidence.compilation_failure_marker = failureMarker
    } else if (tooShort) {
      compilation_passed = false
      noteLines.push(`FAIL compilation[G10]: Output too short (${output.length} chars < ${MIN_CODE_LENGTH} minimum for code task)`)
      evidence.compilation_too_short = true
    } else {
      // Additional TypeScript-specific checks
      const hasCodeStructure = (
        output.includes('function ') ||
        output.includes('const ') ||
        output.includes('export ') ||
        output.includes('class ') ||
        output.includes('interface ') ||
        output.includes('type ') ||
        output.includes('=>')
      )

      if (!hasCodeStructure) {
        compilation_passed = false
        noteLines.push('FAIL compilation[G10]: Output lacks recognizable TypeScript/JavaScript code structure (no function/const/export/class/type keywords found)')
        evidence.no_code_structure = true
      } else {
        compilation_passed = true
        noteLines.push(`PASS compilation[G10]: No error markers detected, length=${output.length}, code structure present`)
      }
    }
    evidence.compilation_passed = compilation_passed
  }

  // ââ A2. Forbidden packages check (code tasks â WS1 HARDENING) âââââââââââââââ
  // WRONG_STACK = automatic FAIL regardless of other checks.

  if (isCodeTask) {
    const forbiddenResult = checkForbiddenPackages(output)
    if (forbiddenResult.hasForbidden) {
      const detected = forbiddenResult.detected.slice(0, 3).join(', ')
      return {
        ...buildResult({
        qa_type,
        verdict: 'FAIL',
        score: 0,
        compilation_passed: false,
        contract_check_passed: null,
        schema_check_passed: null,
        requirement_match_passed: false,
        noteLines: [
          `FAIL[WRONG_STACK]: Output uses FORBIDDEN packages: ${detected}`,
          'RULE: ONLY @supabase/ssr and createAdminSupabaseClient from @/lib/supabase/server are allowed.',
          'PROHIBITED: next-auth, prisma/@prisma/client, @supabase/auth-helpers-nextjs',
        ],
        evidence: { forbidden_packages_detected: forbiddenResult.detected, wrong_stack: true },
        feedback: `QA FAIL (WRONG_STACK): Agent used forbidden package(s): ${detected}. This codebase uses ONLY Supabase native auth.`,
        suggestion: 'Remove all next-auth/Prisma/auth-helpers imports. Use createAdminSupabaseClient() from @/lib/supabase/server for server-side auth.',
        retry_count,
        fail_classification: 'WRONG_STACK',
        schema_corrections: {},
        }),
        mode_used: evaluationMode,
        skipped_rules: [],
      }
    }
    evidence.forbidden_packages_check = 'PASS â no forbidden packages detected'
  }

  // ââ B. Contract/Import check (code tasks only) ââââââââââââââââââââââââââââ

  if (isCodeTask) {
    const desc = (description || '').toLowerCase()
    const hasRouteContract = desc.includes('route') || desc.includes('endpoint') || desc.includes('api/')
    const hasComponentContract = desc.includes('component') || desc.includes('tsx') || desc.includes('jsx')
    const hasExportContract = desc.includes('export') || hasRouteContract || hasComponentContract

    // G10 FIX v5: missingImports check disabled â generates too many false positives.
    // Agent outputs often include prose descriptions with module references that don't
    // look like import statements. Other checks (compilation errors, missing exports)
    // catch truly incomplete code without this noisy heuristic.
    const missingImports = false

    if (hasRouteContract) {
      const hasExport = output.includes('export')
      const hasMethod = /\b(GET|POST|PUT|DELETE|PATCH|export default)\b/.test(output)
      contract_check_passed = hasExport && hasMethod && !missingImports
      evidence.contract_type = 'route'
      evidence.has_export = hasExport
      evidence.has_http_method_or_default = hasMethod
      evidence.missing_imports = missingImports
      if (!contract_check_passed) {
        const reasons = []
        if (!hasExport) reasons.push('missing export')
        if (!hasMethod) reasons.push('missing HTTP method/default export')
        if (missingImports) reasons.push('module references without import statements')
        noteLines.push(`FAIL contract[G10]: Route contract violation â ${reasons.join(', ')}`)
      } else {
        noteLines.push('PASS contract[G10]: Route contract satisfied (export + method/default + imports)')
      }
    } else if (hasComponentContract) {
      const hasExport = output.includes('export')
      const hasFunction = /\b(function|const|class)\b/.test(output)
      contract_check_passed = hasExport && hasFunction && !missingImports
      evidence.contract_type = 'component'
      evidence.has_export = hasExport
      evidence.has_function_or_const = hasFunction
      evidence.missing_imports = missingImports
      if (!contract_check_passed) {
        const reasons = []
        if (!hasExport) reasons.push('missing export')
        if (!hasFunction) reasons.push('missing function/const')
        if (missingImports) reasons.push('module references without import statements')
        noteLines.push(`FAIL contract[G10]: Component contract violation â ${reasons.join(', ')}`)
      } else {
        noteLines.push('PASS contract[G10]: Component contract satisfied')
      }
    } else if (hasExportContract) {
      const hasExport = output.includes('export')
      contract_check_passed = hasExport && !missingImports
      evidence.contract_type = 'export_required'
      evidence.has_export = hasExport
      evidence.missing_imports = missingImports
      if (!contract_check_passed) {
        const reasons = []
        if (!hasExport) reasons.push('missing export')
        if (missingImports) reasons.push('module references without import statements')
        noteLines.push(`FAIL contract[G10]: Export contract violation â ${reasons.join(', ')}`)
      } else {
        noteLines.push('PASS contract[G10]: Export contract satisfied')
      }
    } else {
      // No specific contract terms â still check for missing imports as warning
      if (missingImports) {
        contract_check_passed = false
        noteLines.push('FAIL contract[G10]: Output references modules but has no import statements â likely incomplete code')
        evidence.missing_imports = true
        evidence.contract_type = 'import_check'
      } else {
        contract_check_passed = null
        evidence.contract_type = 'none'
        noteLines.push('SKIP contract[G10]: No specific contract terms detected â import check passed')
      }
    }
    evidence.contract_check_passed = contract_check_passed
  }

  // ââ C. Schema validation (RULE-27) ââââââââââââââââââââââââââââââââââââââââ
  // Always run for code tasks; also run for schema/migration type tasks

  const isSchemaRelevant = isCodeTask || task_type === 'schema' || task_type === 'migration'
  let schemaCorrections: Record<string, string> = {}
  let schemaDeterministicFix = false
  if (isSchemaRelevant) {
    const schemaResult = checkSchemaReferences(output, description, platform_tables)
    schema_check_passed = schemaResult.passed
    schemaCorrections = schemaResult.corrections
    schemaDeterministicFix = schemaResult.has_deterministic_fix
    evidence.schema_referenced_tables = schemaResult.referenced_tables
    evidence.schema_unknown_tables = schemaResult.unknown_tables
    evidence.schema_check_applied = schemaResult.referenced_tables.length > 0
    // WS1: surface corrections in evidence for agent re-run context
    if (Object.keys(schemaResult.corrections).length > 0) {
      evidence.schema_corrections = schemaResult.corrections
      evidence.schema_has_deterministic_fix = schemaResult.has_deterministic_fix
    }

    if (schemaResult.passed === false) {
      noteLines.push(schemaResult.detail)
    } else if (schemaResult.passed === true) {
      noteLines.push(schemaResult.detail)
    } else {
      noteLines.push(`SKIP schema[G10]: ${schemaResult.detail}`)
    }
    evidence.schema_check_passed = schema_check_passed
  }

  // ââ D. Requirement match check ââââââââââââââââââââââââââââââââââââââââââââ

  const minLength = isCodeTask ? MIN_CODE_LENGTH : MIN_NON_CODE_LENGTH
  const outputLower = output.toLowerCase()
  const titleWords = extractKeyTerms(title)
  const matchedTerms = titleWords.filter(w => outputLower.includes(w.toLowerCase()))
  const minMatchRequired = isCodeTask ? 2 : 1
  const termMatchPassed = titleWords.length === 0 || matchedTerms.length >= minMatchRequired
  const lengthPassed = output.length >= minLength
  const notErrorDump = !output.match(/^(Error:|TypeError:|SyntaxError:|FAIL:|BUILD FAILED)/)

  requirement_match_passed = termMatchPassed && lengthPassed && notErrorDump

  evidence.key_terms_from_title = titleWords
  evidence.matched_terms = matchedTerms
  evidence.terms_matched = matchedTerms.length
  evidence.min_terms_required = minMatchRequired
  evidence.length_passed = lengthPassed
  evidence.not_error_dump = notErrorDump

  if (!lengthPassed) {
    noteLines.push(`FAIL requirement_match[G10]: Output too short (${output.length} < ${minLength} chars required)`)
  }
  if (!termMatchPassed) {
    noteLines.push(`FAIL requirement_match[G10]: Only ${matchedTerms.length}/${minMatchRequired} key terms from title found in output (found: ${matchedTerms.join(', ') || 'none'}, required from: ${titleWords.join(', ')})`)
  }
  if (!notErrorDump) {
    noteLines.push('FAIL requirement_match[G10]: Output begins with an error message')
  }
  if (requirement_match_passed) {
    noteLines.push(`PASS requirement_match[G10]: ${matchedTerms.length} key terms matched, length=${output.length}`)
  }
  evidence.requirement_match_passed = requirement_match_passed

  // ââ G10 VERDICT: Fail-by-default multi-layer logic âââââââââââââââââââââââ
  //
  // Rule: ANY layer explicitly false â FAIL immediately.
  // This eliminates all fake-green states â no partial pass, no auto-advance.

  let verdict: QAVerdict

  const anyFalse = (
    compilation_passed === false ||
    contract_check_passed === false ||
    schema_check_passed === false ||
    requirement_match_passed === false
  )

  if (anyFalse) {
    verdict = 'FAIL'
    noteLines.push('VERDICT[G10]: FAIL â one or more checks explicitly failed (fail-by-default rule)')
  } else {
    // ââ Compute score (only when no hard failures) âââââââââââââââââââââââââ
    // Score starts at 100. Deduct for any null (unproven) checks in code tasks.
    let score = 100

    // If code task has null checks where we expected results, deduct
    if (isCodeTask) {
      if (compilation_passed === null) score -= 20  // shouldn't happen for code tasks
      if (contract_check_passed === null) score -= 10  // no contract detected (minor)
      if (schema_check_passed === null) score -= 5   // no DB refs detected (OK)
    }
    if (requirement_match_passed === null) score -= 25  // couldn't verify requirement match

    score = Math.max(0, Math.min(100, score))

    if (score >= PASS_THRESHOLD) {
      verdict = 'PASS'
      noteLines.push(`VERDICT[G10]: PASS â all checks passed, score=${score}/100`)
    } else if (score >= RETRY_THRESHOLD) {
      verdict = 'RETRY_REQUIRED'
      noteLines.push(`VERDICT[G10]: RETRY_REQUIRED â no hard failures but score=${score} below PASS threshold (${PASS_THRESHOLD})`)
    } else {
      verdict = 'FAIL'
      noteLines.push(`VERDICT[G10]: FAIL â score=${score} below RETRY threshold (${RETRY_THRESHOLD})`)
    }

    // Compute numeric score for the return value
    const finalScore = score
    const feedback = verdict !== 'PASS'
      ? `QA ${verdict} (score ${finalScore}/100): ${noteLines.filter(l => l.startsWith('FAIL')).join('; ')}`
      : ''
    const suggestion = buildSuggestion(verdict, isCodeTask, compilation_passed, requirement_match_passed, contract_check_passed, schema_check_passed, evidence, schemaCorrections)

    const escalate_to_incident = verdict !== 'PASS' && retry_count >= ESCALATION_RETRY_THRESHOLD

    // WS1: determine fail_classification for the PASS/RETRY path (should be null for PASS)
    const passFailClass: QAFailClassification = verdict !== 'PASS' ? 'REQUIREMENT_MISMATCH' : null

    return {
      verdict,
      score: finalScore,
      qa_type,
      compilation_passed,
      contract_check_passed,
      schema_check_passed,
      requirement_match_passed,
      notes: noteLines.join('\n'),
      evidence_summary: JSON.stringify(evidence),
      evaluator_model: EVALUATOR_MODEL,
      retry_recommended: verdict === 'RETRY_REQUIRED',
      feedback_for_task: feedback,
      suggestion_for_task: suggestion,
      escalate_to_incident,
      fail_classification: passFailClass,
      schema_corrections: {},
      mode_used: evaluationMode,  // P7.6
      skipped_rules: [],          // P7.6 â feature mode: all rules applied
    }
  }

  // ââ Build feedback for FAIL case ââââââââââââââââââââââââââââââââââââââââââ

  const failedChecks = noteLines.filter(l => l.startsWith('FAIL'))
  const feedback = `QA ${verdict} (G10 fail-by-default): ${failedChecks.join('; ')}`
  const suggestion = buildSuggestion(verdict, isCodeTask, compilation_passed, requirement_match_passed, contract_check_passed, schema_check_passed, evidence, schemaCorrections)
  // verdict is always 'FAIL' here (only reached when anyFalse=true); comparison is intentional
  const escalate_to_incident = retry_count >= ESCALATION_RETRY_THRESHOLD

  // Compute score for failed verdict
  let score = 100
  if (isCodeTask && compilation_passed === false) score -= 30
  if (requirement_match_passed === false) score -= 25
  if (isCodeTask && contract_check_passed === false) score -= 20
  if (isCodeTask && schema_check_passed === false) score -= 25
  score = Math.max(0, Math.min(100, score))

  // WS1: derive fail_classification for FAIL path
  let failClass: QAFailClassification = null
  if (schema_check_passed === false) {
    failClass = schemaDeterministicFix ? 'WRONG_SCHEMA_WITH_FIX' : 'WRONG_SCHEMA_NO_FIX'
  } else if (compilation_passed === false) {
    failClass = 'NO_CODE_STRUCTURE'
  } else if (contract_check_passed === false) {
    failClass = 'CONTRACT_VIOLATION'
  } else if (requirement_match_passed === false) {
    failClass = 'REQUIREMENT_MISMATCH'
  }

  return {
    verdict: 'FAIL',
    score,
    qa_type,
    compilation_passed,
    contract_check_passed,
    schema_check_passed,
    requirement_match_passed,
    notes: noteLines.join('\n'),
    evidence_summary: JSON.stringify(evidence),
    evaluator_model: EVALUATOR_MODEL,
    retry_recommended: false,
    feedback_for_task: feedback,
    suggestion_for_task: suggestion,
    escalate_to_incident,
    fail_classification: failClass,
    schema_corrections: schemaCorrections,
    mode_used: evaluationMode,  // P7.6
    skipped_rules: [],          // P7.6 â feature mode: all rules applied
  }
}

// ââ Helper: extract key terms from task title âââââââââââââââââââââââââââââââââ

function extractKeyTerms(title: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'by',
    'with', 'as', 'is', 'are', 'was', 'be', 'been', 'being', 'do', 'does',
    'create', 'add', 'make', 'build', 'implement', 'update', 'fix', 'set', 'get',
  ])
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 8)
}

// ââ Helper: build feedback suggestion (G10 schema-aware) ââââââââââââââââââââââ

function buildSuggestion(
  verdict: QAVerdict,
  isCodeTask: boolean,
  compilationPassed: boolean | null,
  requirementMatchPassed: boolean | null,
  contractCheckPassed: boolean | null,
  schemaCheckPassed: boolean | null,
  evidence: Record<string, unknown>,
  schemaCorrections?: Record<string, string>,
): string {
  if (verdict === 'PASS') return ''

  const parts: string[] = []

  if (isCodeTask && compilationPassed === false) {
    const marker = evidence.compilation_failure_marker as string | undefined
    if (marker) {
      parts.push(`Remove or fix the ${marker} error in the output.`)
    } else if (evidence.compilation_too_short) {
      parts.push('Output is too short for a code task. Ensure the full implementation is included.')
    } else if (evidence.no_code_structure) {
      parts.push('Output lacks recognizable TypeScript code structure. Ensure code includes function/const/export/class/type declarations.')
    }
  }

  if (requirementMatchPassed === false) {
    const missingTerms = (evidence.key_terms_from_title as string[])?.filter(
      t => !(evidence.matched_terms as string[])?.includes(t)
    )
    if (missingTerms?.length) {
      parts.push(`Ensure the output explicitly addresses: ${missingTerms.slice(0, 4).join(', ')}.`)
    } else {
      parts.push('Output is too brief or does not address the task objective.')
    }
  }

  if (isCodeTask && contractCheckPassed === false) {
    const contractType = evidence.contract_type as string
    if (contractType === 'route') {
      parts.push('Route implementation must include export and an HTTP method handler (GET, POST, etc.).')
    } else if (contractType === 'component') {
      parts.push('Component implementation must include export and a function/const definition.')
    } else if (evidence.missing_imports) {
      parts.push('Add missing import statements for all referenced modules.')
    } else {
      parts.push('Ensure output includes required export statements.')
    }
  }

  if (isCodeTask && schemaCheckPassed === false) {
    const unknownTables = evidence.schema_unknown_tables as string[] | undefined
    if (unknownTables?.length) {
      // WS1: if we have deterministic corrections, provide them explicitly
      const corrections = schemaCorrections && Object.keys(schemaCorrections).length > 0
        ? schemaCorrections
        : (evidence.schema_corrections as Record<string, string> | undefined)
      if (corrections && Object.keys(corrections).length > 0) {
        const correctionList = Object.entries(corrections)
          .map(([wrong, correct]) => `'${wrong}' â '${correct}'`)
          .join(', ')
        parts.push(
          `[WRONG_SCHEMA_WITH_FIX] Replace these DB table references to pass RULE-27: ${correctionList}. ` +
          `These are the correct BuildOS table names for re-submission.`
        )
      } else {
        parts.push(
          `[WRONG_SCHEMA_NO_FIX] DB table reference(s) not in BuildOS schema (RULE-27): ${unknownTables.join(', ')}. ` +
          `Use only known BuildOS tables listed in RULE-27 schema.`
        )
      }
    }
  }

  return parts.length > 0
    ? `QA G10 suggests: ${parts.join(' ')}`
    : 'Review QA notes and retry with more complete, correct output.'
}

// ââ Helper: assemble result object âââââââââââââââââââââââââââââââââââââââââââ

function buildResult(params: {
  qa_type: 'code' | 'non_code'
  verdict: QAVerdict
  score: number
  compilation_passed: boolean | null
  contract_check_passed: boolean | null
  schema_check_passed: boolean | null
  requirement_match_passed: boolean | null
  noteLines: string[]
  evidence: Record<string, unknown>
  feedback: string
  suggestion: string
  retry_count: number
  // WS1 Phase 6.2
  fail_classification?: QAFailClassification
  schema_corrections?: Record<string, string>
}): QAEvaluationResult {
  const { verdict, retry_count } = params
  const escalate_to_incident = verdict !== 'PASS' && retry_count >= ESCALATION_RETRY_THRESHOLD

  return {
    verdict: params.verdict,
    score: params.score,
    qa_type: params.qa_type,
    compilation_passed: params.compilation_passed,
    contract_check_passed: params.contract_check_passed,
    schema_check_passed: params.schema_check_passed,
    requirement_match_passed: params.requirement_match_passed,
    notes: params.noteLines.join('\n'),
    evidence_summary: JSON.stringify(params.evidence),
    evaluator_model: EVALUATOR_MODEL,
    retry_recommended: verdict === 'RETRY_REQUIRED',
    feedback_for_task: params.feedback,
    suggestion_for_task: params.suggestion,
    escalate_to_incident,
    fail_classification: params.fail_classification ?? null,
    schema_corrections: params.schema_corrections ?? {},
    // P7.6: buildResult defaults to feature mode; callers override via spread
    mode_used: 'feature' as QAEvaluationMode,
    skipped_rules: [] as string[],
  }
}

// ââ Persist QA result to DB âââââââââââââââââââââââââââââââââââââââââââââââââââ

export async function persistQAResult(
  admin: SupabaseClient,
  input: QAEvaluationInput,
  result: QAEvaluationResult,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('qa_results')
    .insert({
      task_id: input.task_id,
      project_id: input.project_id,
      verdict: result.verdict,
      score: result.score,
      qa_type: result.qa_type,
      compilation_passed: result.compilation_passed,
      requirement_match_passed: result.requirement_match_passed,
      contract_check_passed: result.contract_check_passed,
      notes: result.notes,
      // G10: schema_check_passed stored in evidence_summary (no DB migration needed)
      evidence_summary: result.evidence_summary,
      evaluator_model: result.evaluator_model,
      retry_recommended: result.retry_recommended,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[qa-evaluator G10] Failed to persist qa_result:', error.message)
    return null
  }
  return data?.id || null
}

// ââ Write QA feedback back to task ââââââââââââââââââââââââââââââââââââââââââââ

export async function persistQAFeedbackToTask(
  admin: SupabaseClient,
  task_id: string,
  result: QAEvaluationResult,
): Promise<void> {
  if (result.verdict === 'PASS') return

  const { error } = await admin
    .from('tasks')
    .update({
      failure_detail: result.feedback_for_task || null,
      failure_suggestion: result.suggestion_for_task || null,
    })
    .eq('id', task_id)

  if (error) {
    console.error('[qa-evaluator G10] Failed to write QA feedback to task:', error.message)
  }
}

// ââ Create incident escalation for repeated QA failure âââââââââââââââââââââââ
// G10 FIX: incident_type changed from 'qa' (invalid) to 'workflow' (valid enum)

export async function escalateToIncident(
  admin: SupabaseClient,
  input: QAEvaluationInput,
  result: QAEvaluationResult,
): Promise<string | null> {
  if (!result.escalate_to_incident) return null

  const title = `Repeated QA failure (G10): ${input.title.slice(0, 80)}`
  const description = [
    `Task ${input.task_id} has failed QA ${input.retry_count} times (threshold: ${ESCALATION_RETRY_THRESHOLD}).`,
    `Latest verdict: ${result.verdict} (score: ${result.score}/100)`,
    `QA type: ${result.qa_type}`,
    `Checks: compilation=${result.compilation_passed}, requirement_match=${result.requirement_match_passed}, contract=${result.contract_check_passed}, schema=${result.schema_check_passed}`,
    `Notes: ${result.notes.slice(0, 500)}`,
  ].join('\n')

  const { data, error } = await admin
    .from('incidents')
    .insert({
      title,
      description,
      severity: 'P2',
      incident_type: 'workflow',  // G10 FIX: was 'qa' (invalid enum), now 'workflow'
      status: 'open',
      owner_domain: 'qa',
      related_task_id: input.task_id,
    })
    .select('id, incident_code')
    .single()

  if (error) {
    console.error('[qa-evaluator G10] Failed to create escalation incident:', error.message)
    return null
  }

  console.log(`[qa-evaluator G10] Escalation incident created: ${data?.incident_code} for task ${input.task_id}`)
  return data?.id || null
}

// ââ Full QA pipeline: evaluate + persist + feedback + escalate ââââââââââââââââ

export async function runFullQAPipeline(
  admin: SupabaseClient,
  input: QAEvaluationInput,
): Promise<{ result: QAEvaluationResult; qa_result_id: string | null; incident_id: string | null }> {
  // 1. Evaluate (G10 multi-layer, fail-by-default)
  const result = evaluateQA(input)

  // 2. Persist qa_results row
  const qa_result_id = await persistQAResult(admin, input, result)

  // 3. Write feedback to task (non-blocking)
  if (result.verdict !== 'PASS') {
    await persistQAFeedbackToTask(admin, input.task_id, result)
  }

  // 4. WS1 Phase 6.2: Auto-requeue when fix is deterministic (WRONG_SCHEMA_WITH_FIX)
  // If QA failed solely because the agent used wrong table names AND we have known
  // replacements for ALL of them, append the correction to failure_detail and reset
  // the task to 'ready' so it is re-dispatched without any manual override.
  if (
    result.fail_classification === 'WRONG_SCHEMA_WITH_FIX' &&
    result.verdict === 'FAIL' &&
    Object.keys(result.schema_corrections).length > 0
  ) {
    const correctionText = Object.entries(result.schema_corrections)
      .map(([wrong, correct]) => `${wrong} â ${correct}`)
      .join(', ')
    const autoFixNote = `[WS1 AUTO-REQUEUE] Schema fix available: ${correctionText}. ` +
      `Task reset to ready. Agent must apply these table name corrections on retry.`

    try {
      await admin
        .from('tasks')
        .update({
          status: 'ready',
          failure_detail: autoFixNote,
          dispatched_at: null,
        })
        .eq('id', input.task_id)
        .in('status', ['awaiting_review', 'failed', 'blocked', 'in_progress'])

      console.log(
        `[qa-evaluator] WS1 AUTO-REQUEUE: task ${input.task_id} reset to ready. Corrections: ${correctionText}`
      )
    } catch (requeueErr) {
      // Non-fatal: task stays in current state; manual review can handle it
      console.warn(`[qa-evaluator] WS1 auto-requeue failed for task ${input.task_id}:`, requeueErr)
    }
  }

  // 5. Escalate if needed
  const incident_id = result.escalate_to_incident
    ? await escalateToIncident(admin, input, result)
    : null

  return { result, qa_result_id, incident_id }
}
