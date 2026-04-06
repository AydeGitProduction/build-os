/**
 * execution-classifier.ts — Phase 7.9 WS1
 *
 * Classifies tasks into execution lanes:
 *   - 'fast'  → Vercel serverless via n8n (standard path, <60s expected)
 *   - 'heavy' → Inline Vercel worker via /api/worker/heavy (300s max, direct Claude call)
 *
 * Heavy tasks are those that:
 *   1. Are of type 'test' (test suite generation = large LLM output)
 *   2. Are schema tasks involving migrations, RLS, audit, or batch operations
 *   3. Have keywords in title/description indicating large-output work
 *
 * This module is used at two points:
 *   A. Task seeding — sets execution_lane on new tasks
 *   B. Dispatch routing — confirms lane before routing (fallback if lane not set)
 */

export type ExecutionLane = 'fast' | 'heavy'

// Keywords in task title or description that indicate a heavy task
const HEAVY_TITLE_KEYWORDS = [
  'migration',
  'migrations',
  'rls',
  'rls policies',
  'audit rls',
  'policy audit',
  'batch',
  'seed data',
  'test suite',
  'integration test',
  'integration tests',
  'e2e test',
  'end-to-end test',
  'smoke test',
  'schema migration',
  'security audit',
  'full test',
  'comprehensive test',
  'write tests',
  'write test',
  'generate tests',
]

// Task types that are always heavy
const ALWAYS_HEAVY_TASK_TYPES = ['test']

// Schema subtypes that flip to heavy based on keywords
const HEAVY_SCHEMA_KEYWORDS = [
  'migration', 'migrations', 'rls', 'policy', 'policies', 'audit', 'seed', 'batch',
]

export interface ClassifiableTask {
  task_type?: string | null
  title?: string | null
  description?: string | null
  estimated_tokens?: number | null
  execution_lane?: string | null
}

/**
 * Classify a task as 'fast' or 'heavy'.
 * Heavy tasks bypass n8n and execute inline on Vercel (300s maxDuration).
 */
export function classifyTask(task: ClassifiableTask): ExecutionLane {
  // If already explicitly classified, respect it
  if (task.execution_lane === 'heavy') return 'heavy'
  if (task.execution_lane === 'fast') return 'fast'

  const taskType = (task.task_type ?? '').toLowerCase()
  const title = (task.title ?? '').toLowerCase()
  const description = (task.description ?? '').toLowerCase()

  // Rule 1: All 'test' type tasks are heavy
  if (ALWAYS_HEAVY_TASK_TYPES.includes(taskType)) {
    return 'heavy'
  }

  // Rule 2: Schema tasks with heavy keywords → heavy
  if (taskType === 'schema') {
    if (HEAVY_SCHEMA_KEYWORDS.some(kw => title.includes(kw) || description.includes(kw))) {
      return 'heavy'
    }
  }

  // Rule 3: Any task type with heavy keywords in title → heavy
  if (HEAVY_TITLE_KEYWORDS.some(kw => title.includes(kw))) {
    return 'heavy'
  }

  // Rule 4: High estimated token count → heavy (if field present)
  if (task.estimated_tokens != null && task.estimated_tokens > 3000) {
    return 'heavy'
  }

  return 'fast'
}

/**
 * Returns a human-readable explanation of why a task was classified as heavy.
 */
export function classifyTaskWithReason(task: ClassifiableTask): {
  lane: ExecutionLane
  reason: string
} {
  if (task.execution_lane === 'heavy') {
    return { lane: 'heavy', reason: 'explicit execution_lane=heavy' }
  }
  if (task.execution_lane === 'fast') {
    return { lane: 'fast', reason: 'explicit execution_lane=fast' }
  }

  const taskType = (task.task_type ?? '').toLowerCase()
  const title = (task.title ?? '').toLowerCase()
  const description = (task.description ?? '').toLowerCase()

  if (ALWAYS_HEAVY_TASK_TYPES.includes(taskType)) {
    return { lane: 'heavy', reason: `task_type='${taskType}' is always heavy` }
  }

  if (taskType === 'schema') {
    const matched = HEAVY_SCHEMA_KEYWORDS.find(kw => title.includes(kw) || description.includes(kw))
    if (matched) {
      return { lane: 'heavy', reason: `schema task with heavy keyword: '${matched}'` }
    }
  }

  const matchedTitle = HEAVY_TITLE_KEYWORDS.find(kw => title.includes(kw))
  if (matchedTitle) {
    return { lane: 'heavy', reason: `title contains heavy keyword: '${matchedTitle}'` }
  }

  if (task.estimated_tokens != null && task.estimated_tokens > 3000) {
    return { lane: 'heavy', reason: `estimated_tokens=${task.estimated_tokens} > 3000` }
  }

  return { lane: 'fast', reason: 'no heavy signals detected' }
}
