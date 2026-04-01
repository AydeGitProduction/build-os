/**
 * Block G3: Real QA Evaluator
 *
 * Replaces the unconditional score=88 auto-pass pattern.
 * Performs evidence-based checks on agent output and returns a structured verdict.
 *
 * LIMITATIONS (documented per QA-Gate-Protocol.md §13):
 * - tsc --noEmit is not runnable on raw agent output text in Vercel serverless.
 *   Compilation check uses deterministic pattern-based static analysis instead.
 * - No LLM-based semantic evaluation (keyword-presence only for requirement match).
 * - Code is not executed; runtime behavior cannot be verified.
 *
 * Evaluator model: buildos-qa-evaluator-v1 (static analysis)
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ── Task type classification ────────────────────────────────────────────────

const CODE_TASK_TYPES = new Set([
  'code', 'schema', 'test', 'implementation', 'migration',
])

const CODE_AGENT_ROLES = new Set([
  'frontend_engineer', 'backend_engineer', 'infrastructure_engineer',
])

// ── Failure markers that indicate compilation/runtime errors in output ──────

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
]

// Minimum output lengths to pass
const MIN_CODE_LENGTH = 200
const MIN_NON_CODE_LENGTH = 100

// Score thresholds
const PASS_THRESHOLD = 70
const RETRY_THRESHOLD = 50   // 50-69 = RETRY_REQUIRED, <50 = FAIL

// QA evaluator model identifier
const EVALUATOR_MODEL = 'buildos-qa-evaluator-v1'

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
  requirement_match_passed: boolean | null
  contract_check_passed: boolean | null
  notes: string
  evidence_summary: string
  evaluator_model: string
  retry_recommended: boolean
  feedback_for_task: string      // Written to tasks.failure_detail
  suggestion_for_task: string    // Written to tasks.failure_suggestion
  escalate_to_incident: boolean  // True if retry_count >= threshold
}

// ── Main evaluator ────────────────────────────────────────────────────────────

export function evaluateQA(input: QAEvaluationInput): QAEvaluationResult {
  const { task_type, agent_role, title, description, raw_output, retry_count } = input

  // Determine task category
  const isCodeTask = CODE_TASK_TYPES.has(task_type) || CODE_AGENT_ROLES.has(agent_role)
  const qa_type: 'code' | 'non_code' = isCodeTask ? 'code' : 'non_code'

  const output = (raw_output || '').trim()

  // ── Guard: empty output → immediate FAIL ─────────────────────────────────

  if (!output || output.length === 0) {
    return buildResult({
      qa_type,
      verdict: 'FAIL',
      score: 0,
      compilation_passed: isCodeTask ? false : null,
      requirement_match_passed: false,
      contract_check_passed: null,
      noteLines: ['FAIL: Output is empty. No content was produced by the agent.'],
      evidence: { empty: true, length: 0 },
      feedback: 'QA FAIL: Agent produced empty output. Task must be re-attempted.',
      suggestion: 'Ensure the agent produces actual content. Check if the task description is clear enough to guide output generation.',
      retry_count,
    })
  }

  // ── Run checks ───────────────────────────────────────────────────────────

  const noteLines: string[] = []
  const evidence: Record<string, unknown> = {
    output_length: output.length,
    qa_type,
    evaluator: EVALUATOR_MODEL,
  }

  let compilation_passed: boolean | null = null
  let requirement_match_passed: boolean | null = null
  let contract_check_passed: boolean | null = null

  // ── A. Compilation check (code tasks only) ────────────────────────────────

  if (isCodeTask) {
    const failureMarker = COMPILATION_FAILURE_MARKERS.find(m => output.includes(m))
    const tooShort = output.length < MIN_CODE_LENGTH

    if (failureMarker) {
      compilation_passed = false
      noteLines.push(`FAIL compilation: Output contains error marker: "${failureMarker}"`)
      evidence.compilation_failure_marker = failureMarker
    } else if (tooShort) {
      compilation_passed = false
      noteLines.push(`FAIL compilation: Output too short (${output.length} chars < ${MIN_CODE_LENGTH} minimum for code task)`)
      evidence.compilation_too_short = true
    } else {
      compilation_passed = true
      noteLines.push(`PASS compilation: No error markers detected, output length ${output.length} chars`)
    }
    evidence.compilation_passed = compilation_passed
  }

  // ── B. Requirement match check ────────────────────────────────────────────

  const minLength = isCodeTask ? MIN_CODE_LENGTH : MIN_NON_CODE_LENGTH
  const outputLower = output.toLowerCase()
  const titleWords = extractKeyTerms(title)
  const matchedTerms = titleWords.filter(w => outputLower.includes(w.toLowerCase()))
  const minMatchRequired = isCodeTask ? 2 : 1
  const termMatchPassed = matchedTerms.length >= minMatchRequired
  const lengthPassed = output.length >= minLength
  const notErrorDump = !output.match(/^(Error:|TypeError:|SyntaxError:)/)

  requirement_match_passed = termMatchPassed && lengthPassed && notErrorDump

  evidence.key_terms_from_title = titleWords
  evidence.matched_terms = matchedTerms
  evidence.terms_matched = matchedTerms.length
  evidence.min_terms_required = minMatchRequired
  evidence.length_passed = lengthPassed
  evidence.not_error_dump = notErrorDump

  if (!lengthPassed) {
    noteLines.push(`FAIL requirement_match: Output too short (${output.length} < ${minLength} chars)`)
  }
  if (!termMatchPassed) {
    noteLines.push(`FAIL requirement_match: Only ${matchedTerms.length}/${minMatchRequired} key terms from title found in output (found: ${matchedTerms.join(', ') || 'none'})`)
  }
  if (!notErrorDump) {
    noteLines.push('FAIL requirement_match: Output begins with an error message')
  }
  if (requirement_match_passed) {
    noteLines.push(`PASS requirement_match: ${matchedTerms.length} key terms matched, length ${output.length}`)
  }
  evidence.requirement_match_passed = requirement_match_passed

  // ── C. Contract sanity check (code tasks only, conditional) ───────────────

  if (isCodeTask) {
    const desc = (description || '').toLowerCase()
    const hasRouteContract = desc.includes('route') || desc.includes('endpoint') || desc.includes('api/')
    const hasComponentContract = desc.includes('component') || desc.includes('tsx') || desc.includes('jsx')
    const hasExportContract = desc.includes('export') || hasRouteContract || hasComponentContract

    if (hasRouteContract) {
      const hasExport = output.includes('export')
      const hasMethod = /\b(GET|POST|PUT|DELETE|PATCH|export default)\b/.test(output)
      contract_check_passed = hasExport && hasMethod
      evidence.contract_type = 'route'
      evidence.has_export = hasExport
      evidence.has_http_method_or_default = hasMethod
      if (!contract_check_passed) {
        noteLines.push(`FAIL contract: Route task requires export + HTTP method/default export. Found export=${hasExport}, method=${hasMethod}`)
      } else {
        noteLines.push('PASS contract: Route contract satisfied (export + method/default found)')
      }
    } else if (hasComponentContract) {
      const hasExport = output.includes('export')
      const hasFunction = /\b(function|const|class)\b/.test(output)
      contract_check_passed = hasExport && hasFunction
      evidence.contract_type = 'component'
      evidence.has_export = hasExport
      evidence.has_function_or_const = hasFunction
      if (!contract_check_passed) {
        noteLines.push(`FAIL contract: Component task requires export + function/const. Found export=${hasExport}, function=${hasFunction}`)
      } else {
        noteLines.push('PASS contract: Component contract satisfied')
      }
    } else if (hasExportContract) {
      const hasExport = output.includes('export')
      contract_check_passed = hasExport
      evidence.contract_type = 'export_required'
      evidence.has_export = hasExport
      if (!hasExport) {
        noteLines.push('FAIL contract: Task description mentions export requirement but none found in output')
      } else {
        noteLines.push('PASS contract: Export requirement satisfied')
      }
    } else {
      // No contract terms found → not applicable
      contract_check_passed = null
      evidence.contract_type = 'none'
      noteLines.push('SKIP contract: No contract terms (route/component/export) found in task description')
    }
    evidence.contract_check_passed = contract_check_passed
  }

  // ── Compute score ─────────────────────────────────────────────────────────

  let score = 100
  if (isCodeTask && compilation_passed === false) score -= 30
  if (requirement_match_passed === false) score -= 25
  if (isCodeTask && contract_check_passed === false) score -= 20
  score = Math.max(0, Math.min(100, score))

  // ── Determine verdict ─────────────────────────────────────────────────────

  let verdict: QAVerdict
  // Critical: compilation fail or empty → FAIL
  if (isCodeTask && compilation_passed === false) {
    verdict = 'FAIL'
  } else if (score >= PASS_THRESHOLD) {
    verdict = 'PASS'
  } else if (score >= RETRY_THRESHOLD) {
    verdict = 'RETRY_REQUIRED'
  } else {
    verdict = 'FAIL'
  }

  // ── Build feedback ────────────────────────────────────────────────────────

  const failedChecks = noteLines.filter(l => l.startsWith('FAIL'))
  const feedback = verdict !== 'PASS'
    ? `QA ${verdict} (score ${score}/100): ${failedChecks.join('; ')}`
    : ''
  const suggestion = buildSuggestion(verdict, isCodeTask, compilation_passed, requirement_match_passed, contract_check_passed, evidence)

  // ── Escalation check ──────────────────────────────────────────────────────

  const escalate_to_incident = verdict !== 'PASS' && retry_count >= ESCALATION_RETRY_THRESHOLD

  return buildResult({
    qa_type,
    verdict,
    score,
    compilation_passed,
    requirement_match_passed,
    contract_check_passed,
    noteLines,
    evidence,
    feedback,
    suggestion,
    retry_count,
  })
}

// ── Helper: extract key terms from task title ─────────────────────────────────

function extractKeyTerms(title: string): string[] {
  // Remove common stop words, keep meaningful terms
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
    .slice(0, 8)  // max 8 terms
}

// ── Helper: build feedback suggestion ────────────────────────────────────────

function buildSuggestion(
  verdict: QAVerdict,
  isCodeTask: boolean,
  compilationPassed: boolean | null,
  requirementMatchPassed: boolean | null,
  contractCheckPassed: boolean | null,
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
    } else {
      parts.push('Task requires exported symbols. Ensure output includes export statements.')
    }
  }

  return parts.length > 0
    ? `QA suggests: ${parts.join(' ')}`
    : 'Review QA notes and retry with more complete output.'
}

// ── Helper: assemble result object ───────────────────────────────────────────

function buildResult(params: {
  qa_type: 'code' | 'non_code'
  verdict: QAVerdict
  score: number
  compilation_passed: boolean | null
  requirement_match_passed: boolean | null
  contract_check_passed: boolean | null
  noteLines: string[]
  evidence: Record<string, unknown>
  feedback: string
  suggestion: string
  retry_count: number
}): QAEvaluationResult {
  const { verdict, score, retry_count } = params
  const escalate_to_incident = verdict !== 'PASS' && retry_count >= ESCALATION_RETRY_THRESHOLD

  return {
    verdict: params.verdict,
    score: params.score,
    qa_type: params.qa_type,
    compilation_passed: params.compilation_passed,
    requirement_match_passed: params.requirement_match_passed,
    contract_check_passed: params.contract_check_passed,
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
      evidence_summary: result.evidence_summary,
      evaluator_model: result.evaluator_model,
      retry_recommended: result.retry_recommended,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[qa-evaluator] Failed to persist qa_result:', error.message)
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
  if (result.verdict === 'PASS') return  // No feedback needed on pass

  const { error } = await admin
    .from('tasks')
    .update({
      failure_detail: result.feedback_for_task || null,
      failure_suggestion: result.suggestion_for_task || null,
    })
    .eq('id', task_id)

  if (error) {
    console.error('[qa-evaluator] Failed to write QA feedback to task:', error.message)
  }
}

// ── Create incident escalation for repeated QA failure ───────────────────────

export async function escalateToIncident(
  admin: SupabaseClient,
  input: QAEvaluationInput,
  result: QAEvaluationResult,
): Promise<string | null> {
  if (!result.escalate_to_incident) return null

  const title = `Repeated QA failure: ${input.title.slice(0, 80)}`
  const description = [
    `Task ${input.task_id} has failed QA ${input.retry_count} times (threshold: ${ESCALATION_RETRY_THRESHOLD}).`,
    `Latest verdict: ${result.verdict} (score: ${result.score}/100)`,
    `QA type: ${result.qa_type}`,
    `Checks: compilation=${result.compilation_passed}, requirement_match=${result.requirement_match_passed}, contract=${result.contract_check_passed}`,
    `Notes: ${result.notes.slice(0, 500)}`,
  ].join('\n')

  const { data, error } = await admin
    .from('incidents')
    .insert({
      title,
      description,
      severity: 'P2',
      incident_type: 'qa',
      status: 'open',
      owner_domain: 'qa',
      related_task_id: input.task_id,
    })
    .select('id, incident_code')
    .single()

  if (error) {
    console.error('[qa-evaluator] Failed to create escalation incident:', error.message)
    return null
  }

  console.log(`[qa-evaluator] Escalation incident created: ${data?.incident_code} for task ${input.task_id}`)
  return data?.id || null
}

// ── Full QA pipeline: evaluate + persist + feedback + escalate ────────────────

export async function runFullQAPipeline(
  admin: SupabaseClient,
  input: QAEvaluationInput,
): Promise<{ result: QAEvaluationResult; qa_result_id: string | null; incident_id: string | null }> {
  // 1. Evaluate
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
