/**
 * Block G10: Real QA Evaluator — Fail-by-Default Multi-Layer Validation
 *
 * G10 REBUILD: Replaces pattern-matching rubber-stamp with evidence-backed checks.
 * Core change: FAIL-BY-DEFAULT — if QA cannot prove correctness, verdict = FAIL.
 * ANY check that is explicitly false → FAIL immediately (no auto-pass path).
 *
 * Multi-layer checks:
 *   A) compilation_passed:     TypeScript syntax / error-marker check
 *   B) contract_check_passed:  import/export / route contract validation
 *   C) schema_check_passed:    DB table reference validation (RULE-27)
 *   D) requirement_match_passed: output matches task objective
 *
 * Verdict rules (G10):
 *   ANY layer === false → FAIL
 *   ALL non-null layers === true → PASS (score ≥ PASS_THRESHOLD)
 *   score in [RETRY_THRESHOLD, PASS_THRESHOLD) → RETRY_REQUIRED
 *   otherwise → FAIL
 *
 * LIMITATIONS (per QA-Gate-Protocol.md §13):
 * - tsc --noEmit cannot run on raw text in Vercel serverless; pattern-based analysis used.
 * - DB schema validation uses known table list; cannot query live schema at eval time.
 * - Code is not executed; runtime behavior cannot be verified.
 *
 * Evaluator model: buildos-qa-evaluator-v2 (G10 multi-layer)
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ── Task type classification ────────────────────────────────────────────────

const CODE_TASK_TYPES = new Set([
  'code', 'schema', 'test', 'implementation', 'migration',
])

const CODE_AGENT_ROLES = new Set([
  'frontend_engineer', 'backend_engineer', 'infrastructure_engineer',
])

// ── Known BuildOS database tables (RULE-27 schema validation) ────────────────
// Used to detect invalid table references in agent output.
// Any .from('name') or INSERT INTO name referencing a non-existent table → FAIL.

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
])

// ── G10: Failure markers that indicate compilation/runtime errors ─────────────

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
const MIN_CODE_LENGTH = 300      // Raised from 200 — real code must be substantial
const MIN_NON_CODE_LENGTH = 150  // Raised from 100 — non-code must show real work

// Score thresholds
const PASS_THRESHOLD = 70
const RETRY_THRESHOLD = 50

// QA evaluator model identifier
const EVALUATOR_MODEL = 'buildos-qa-evaluator-v2'

// Escalation: if retry_count >= this, create incident linkage
const ESCALATION_RETRY_THRESHOLD = 2

// ── Types ────────────────────────────────────────────────────────────────────

export type QAVerdict = 'PASS' | 'FAIL' | 'RETRY_REQUIRED' | 'BLOCKED'

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
}

export interface QAEvaluationResult {
  verdict: QAVerdict
  score: number
  qa_type: 'code' | 'non_code'
  compilation_passed: boolean | null
  contract_check_passed: boolean | null
  schema_check_passed: boolean | null        // G10: NEW — RULE-27 DB table validation
  requirement_match_passed: boolean | null
  notes: string
  evidence_summary: string
  evaluator_model: string
  retry_recommended: boolean
  feedback_for_task: string
  suggestion_for_task: string
  escalate_to_incident: boolean
}

// ── G10: Extract DB table references from output text ────────────────────────
// Matches patterns like:
//   .from('tableName')         — Supabase client
//   .from("tableName")         — Supabase client (double quotes)
//   INSERT INTO tableName      — SQL
//   SELECT ... FROM tableName  — SQL
//   UPDATE tableName           — SQL
//   DELETE FROM tableName      — SQL
//   admin.from('tableName')    — admin client

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

  // SQL patterns: INSERT INTO, FROM, UPDATE, DELETE FROM
  const sqlPatterns = [
    /INSERT\s+INTO\s+([a-z_][a-z0-9_]*)/gi,
    /\bFROM\s+([a-z_][a-z0-9_]*)\b/gi,
    /UPDATE\s+([a-z_][a-z0-9_]*)\s+SET/gi,
    /DELETE\s+FROM\s+([a-z_][a-z0-9_]*)/gi,
  ]

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
             // G10 FIX v3: additional common false-positives from integration-related output
             'url', 'uri', 'path', 'host', 'port', 'key', 'value', 'id', 'name', 'code',
             'body', 'head', 'form', 'query', 'params', 'props', 'state', 'ref',
             'list', 'map', 'set', 'string', 'number', 'boolean',
             'input', 'output', 'payload', 'schema', 'model', 'entity', 'record',
             'row', 'column', 'field', 'item', 'element', 'entry',
             'index', 'hash', 'scope', 'role', 'mode', 'status', 'stage',
             'base', 'root', 'tree', 'branch', 'leaf'].includes(name)) {
        tables.add(name)
      }
    }
  }

  return Array.from(tables)
}

// ── G10: Validate table references against known BuildOS schema ───────────────

function checkSchemaReferences(output: string, description: string | null): {
  passed: boolean | null
  referenced_tables: string[]
  unknown_tables: string[]
  detail: string
} {
  const referenced = extractTableReferences(output)

  if (referenced.length === 0) {
    // No DB references found — schema check not applicable
    return {
      passed: null,
      referenced_tables: [],
      unknown_tables: [],
      detail: 'No DB table references detected in output — schema check skipped',
    }
  }

  const unknown = referenced.filter(t => !KNOWN_BUILDOS_TABLES.has(t.toLowerCase()))

  if (unknown.length > 0) {
    return {
      passed: false,
      referenced_tables: referenced,
      unknown_tables: unknown,
      detail: `FAIL schema: Output references unknown DB table(s): ${unknown.join(', ')}. Known tables must be used (RULE-27).`,
    }
  }

  return {
    passed: true,
    referenced_tables: referenced,
    unknown_tables: [],
    detail: `PASS schema: All ${referenced.length} referenced table(s) are valid BuildOS tables: ${referenced.join(', ')}`,
  }
}

// ── G10: Main evaluator ───────────────────────────────────────────────────────

export function evaluateQA(input: QAEvaluationInput): QAEvaluationResult {
  const { task_type, agent_role, title, description, raw_output, retry_count } = input

  // Determine task category
  const isCodeTask = CODE_TASK_TYPES.has(task_type) || CODE_AGENT_ROLES.has(agent_role)
  const qa_type: 'code' | 'non_code' = isCodeTask ? 'code' : 'non_code'

  const output = (raw_output || '').trim()

  // ── G10 FAIL-BY-DEFAULT: empty or missing output → immediate FAIL ──────────

  if (!output || output.length === 0) {
    return buildResult({
      qa_type,
      verdict: 'FAIL',
      score: 0,
      compilation_passed: isCodeTask ? false : null,
      contract_check_passed: null,
      schema_check_passed: null,
      requirement_match_passed: false,
      noteLines: ['FAIL[G10]: Output is empty. No content produced by agent. FAIL-BY-DEFAULT applies.'],
      evidence: { empty: true, length: 0, fail_by_default: true },
      feedback: 'QA FAIL (G10): Agent produced empty output. Task must be re-attempted.',
      suggestion: 'Ensure the agent produces actual content. Verify the task description is actionable.',
      retry_count,
    })
  }

  // ── Run all checks ───────────────────────────────────────────────────────

  const noteLines: string[] = []
  const evidence: Record<string, unknown> = {
    output_length: output.length,
    qa_type,
    evaluator: EVALUATOR_MODEL,
    g10_fail_by_default: true,
  }

  let compilation_passed: boolean | null = null
  let contract_check_passed: boolean | null = null
  let schema_check_passed: boolean | null = null
  let requirement_match_passed: boolean | null = null

  // ── A. Compilation check (code tasks only) ────────────────────────────────

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

  // ── B. Contract/Import check (code tasks only) ────────────────────────────

  if (isCodeTask) {
    const desc = (description || '').toLowerCase()
    const hasRouteContract = desc.includes('route') || desc.includes('endpoint') || desc.includes('api/')
    const hasComponentContract = desc.includes('component') || desc.includes('tsx') || desc.includes('jsx')
    const hasExportContract = desc.includes('export') || hasRouteContract || hasComponentContract

    // Check for import statement presence when code references external modules
    const hasModuleRefs = /from\s+['"][@a-zA-Z]/.test(output) // e.g., from 'next/server'
    const hasImportStatements = /^import\s/m.test(output) || /\bimport\s*\{/.test(output)

    // If code references modules but has no import statements, that's suspicious
    // (unless it's inside a string/comment)
    const missingImports = hasModuleRefs && !hasImportStatements

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
        noteLines.push(`FAIL contract[G10]: Route contract violation — ${reasons.join(', ')}`)
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
        noteLines.push(`FAIL contract[G10]: Component contract violation — ${reasons.join(', ')}`)
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
        noteLines.push(`FAIL contract[G10]: Export contract violation — ${reasons.join(', ')}`)
      } else {
        noteLines.push('PASS contract[G10]: Export contract satisfied')
      }
    } else {
      // No specific contract terms — still check for missing imports as warning
      if (missingImports) {
        contract_check_passed = false
        noteLines.push('FAIL contract[G10]: Output references modules but has no import statements — likely incomplete code')
        evidence.missing_imports = true
        evidence.contract_type = 'import_check'
      } else {
        contract_check_passed = null
        evidence.contract_type = 'none'
        noteLines.push('SKIP contract[G10]: No specific contract terms detected — import check passed')
      }
    }
    evidence.contract_check_passed = contract_check_passed
  }

  // ── C. Schema validation (RULE-27) ────────────────────────────────────────
  // Always run for code tasks; also run for schema/migration type tasks

  const isSchemaRelevant = isCodeTask || task_type === 'schema' || task_type === 'migration'
  if (isSchemaRelevant) {
    const schemaResult = checkSchemaReferences(output, description)
    schema_check_passed = schemaResult.passed
    evidence.schema_referenced_tables = schemaResult.referenced_tables
    evidence.schema_unknown_tables = schemaResult.unknown_tables
    evidence.schema_check_applied = schemaResult.referenced_tables.length > 0

    if (schemaResult.passed === false) {
      noteLines.push(schemaResult.detail)
    } else if (schemaResult.passed === true) {
      noteLines.push(schemaResult.detail)
    } else {
      noteLines.push(`SKIP schema[G10]: ${schemaResult.detail}`)
    }
    evidence.schema_check_passed = schema_check_passed
  }

  // ── D. Requirement match check ────────────────────────────────────────────

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

  // ── G10 VERDICT: Fail-by-default multi-layer logic ───────────────────────
  //
  // Rule: ANY layer explicitly false → FAIL immediately.
  // This eliminates all fake-green states — no partial pass, no auto-advance.

  let verdict: QAVerdict

  const anyFalse = (
    compilation_passed === false ||
    contract_check_passed === false ||
    schema_check_passed === false ||
    requirement_match_passed === false
  )

  if (anyFalse) {
    verdict = 'FAIL'
    noteLines.push('VERDICT[G10]: FAIL — one or more checks explicitly failed (fail-by-default rule)')
  } else {
    // ── Compute score (only when no hard failures) ─────────────────────────
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
      noteLines.push(`VERDICT[G10]: PASS — all checks passed, score=${score}/100`)
    } else if (score >= RETRY_THRESHOLD) {
      verdict = 'RETRY_REQUIRED'
      noteLines.push(`VERDICT[G10]: RETRY_REQUIRED — no hard failures but score=${score} below PASS threshold (${PASS_THRESHOLD})`)
    } else {
      verdict = 'FAIL'
      noteLines.push(`VERDICT[G10]: FAIL — score=${score} below RETRY threshold (${RETRY_THRESHOLD})`)
    }

    // Compute numeric score for the return value
    const finalScore = score
    const feedback = verdict !== 'PASS'
      ? `QA ${verdict} (score ${finalScore}/100): ${noteLines.filter(l => l.startsWith('FAIL')).join('; ')}`
      : ''
    const suggestion = buildSuggestion(verdict, isCodeTask, compilation_passed, requirement_match_passed, contract_check_passed, schema_check_passed, evidence)

    const escalate_to_incident = verdict !== 'PASS' && retry_count >= ESCALATION_RETRY_THRESHOLD

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
    }
  }

  // ── Build feedback for FAIL case ──────────────────────────────────────────

  const failedChecks = noteLines.filter(l => l.startsWith('FAIL'))
  const feedback = `QA ${verdict} (G10 fail-by-default): ${failedChecks.join('; ')}`
  const suggestion = buildSuggestion(verdict, isCodeTask, compilation_passed, requirement_match_passed, contract_check_passed, schema_check_passed, evidence)
  const escalate_to_incident = verdict !== 'PASS' && retry_count >= ESCALATION_RETRY_THRESHOLD

  // Compute score for failed verdict
  let score = 100
  if (isCodeTask && compilation_passed === false) score -= 30
  if (requirement_match_passed === false) score -= 25
  if (isCodeTask && contract_check_passed === false) score -= 20
  if (isCodeTask && schema_check_passed === false) score -= 25
  score = Math.max(0, Math.min(100, score))

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
  }
}

// ── Helper: extract key terms from task title ─────────────────────────────────

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

// ── Helper: build feedback suggestion (G10 schema-aware) ──────────────────────

function buildSuggestion(
  verdict: QAVerdict,
  isCodeTask: boolean,
  compilationPassed: boolean | null,
  requirementMatchPassed: boolean | null,
  contractCheckPassed: boolean | null,
  schemaCheckPassed: boolean | null,
  evidence: Record<string, unknown>,
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
      parts.push(`DB table reference(s) not in BuildOS schema (RULE-27): ${unknownTables.join(', ')}. Use only known tables.`)
    }
  }

  return parts.length > 0
    ? `QA G10 suggests: ${parts.join(' ')}`
    : 'Review QA notes and retry with more complete, correct output.'
}

// ── Helper: assemble result object ───────────────────────────────────────────

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
  }
}

// ── Persist QA result to DB ───────────────────────────────────────────────────

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

// ── Write QA feedback back to task ────────────────────────────────────────────

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

// ── Create incident escalation for repeated QA failure ───────────────────────
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

// ── Full QA pipeline: evaluate + persist + feedback + escalate ────────────────

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

  // 4. Escalate if needed
  const incident_id = result.escalate_to_incident
    ? await escalateToIncident(admin, input, result)
    : null

  return { result, qa_result_id, incident_id }
}
