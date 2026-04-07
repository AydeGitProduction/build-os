/**
 * execution-classifier.ts — Phase 7.9 WS1 + Phase 7.9c WS2
 *
 * Classifies tasks into execution lanes:
 *   - 'fast'  → Vercel serverless via n8n (standard path, <60s expected)
 *   - 'heavy' → Inline Vercel worker via /api/worker/heavy (300s max, direct Claude call)
 *
 * P7.9c WS2 adds executor subtype classification for heavy tasks:
 *   - 'worker_inline_safe'  → Heavy but bounded; small-output heavy tasks (<30s typical)
 *   - 'worker_long_llm'     → Large LLM generation: feature code, complex implementations
 *   - 'worker_schema'       → DDL/migration/RLS work; schema synthesis tasks
 *   - 'worker_testgen'      → Test suite generation; always long, always schema-aware
 *
 * Subtype is used by the dispatch router to select the correct executor endpoint
 * and timeout budget, preventing predictable timeouts from wrong runtime assignment.
 *
 * This module is used at two points:
 *   A. Task seeding — sets execution_lane on new tasks
 *   B. Dispatch routing — confirms lane and subtype before routing
 */

export type ExecutionLane = 'fast' | 'heavy'

/**
 * P7.9c WS2: Executor subtype for heavy tasks.
 * Determines which runtime shape the task should use within the heavy lane.
 */
export type ExecutorSubtype =
  | 'worker_inline_safe'   // Heavy but short: bounded LLM, no migration, no testgen
  | 'worker_long_llm'      // Large LLM generation: long outputs, feature implementation
  | 'worker_schema'        // DDL/migration/RLS: schema changes, must never hit inline timeout
  | 'worker_testgen'       // Test suite generation: large output + schema-aware

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

// Task type → executor subtype mapping (heavy tasks only)
const TASK_TYPE_SUBTYPE_MAP: Record<string, ExecutorSubtype> = {
  test:     'worker_testgen',
  schema:   'worker_schema',
  migration:'worker_schema',
}

// Title/description keywords → executor subtype (heavy tasks only)
const SUBTYPE_KEYWORD_MAP: Array<{ keywords: string[]; subtype: ExecutorSubtype }> = [
  {
    keywords: ['migration', 'migrations', 'schema migration', 'rls', 'rls policies', 'policy audit',
               'audit rls', 'seed data', 'batch', 'security audit'],
    subtype: 'worker_schema',
  },
  {
    keywords: ['test suite', 'integration test', 'integration tests', 'e2e test', 'end-to-end test',
               'smoke test', 'full test', 'comprehensive test', 'write tests', 'write test', 'generate tests'],
    subtype: 'worker_testgen',
  },
  {
    keywords: ['implementation', 'implement', 'build', 'create feature', 'generate'],
    subtype: 'worker_long_llm',
  },
]

/**
 * P7.9c WS2: Classify a heavy task into its executor subtype.
 * Only meaningful for 'heavy' lane tasks; fast tasks always use n8n.
 * Returns 'worker_inline_safe' if no specific subtype signal found.
 */
export function classifyExecutorSubtype(task: ClassifiableTask): ExecutorSubtype {
  const taskType = (task.task_type ?? '').toLowerCase()
  const title = (task.title ?? '').toLowerCase()
  const description = (task.description ?? '').toLowerCase()

  // Rule 1: Direct task_type mapping
  if (taskType in TASK_TYPE_SUBTYPE_MAP) {
    return TASK_TYPE_SUBTYPE_MAP[taskType]
  }

  // Rule 2: Keyword scanning (title + description)
  for (const { keywords, subtype } of SUBTYPE_KEYWORD_MAP) {
    if (keywords.some(kw => title.includes(kw) || description.includes(kw))) {
      return subtype
    }
  }

  // Rule 3: High estimated token count → long LLM
  if (task.estimated_tokens != null && task.estimated_tokens > 5000) {
    return 'worker_long_llm'
  }

  // Default: treat as inline-safe heavy (smallest timeout risk)
  return 'worker_inline_safe'
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

/**
 * P7.9c WS2: Full classification — lane + executor subtype.
 * Use this at dispatch time to get both the routing lane and the executor shape.
 */
export function classifyTaskFull(task: ClassifiableTask): {
  lane: ExecutionLane
  subtype: ExecutorSubtype | null
  reason: string
} {
  const { lane, reason } = classifyTaskWithReason(task)
  if (lane === 'fast') {
    return { lane, subtype: null, reason }
  }
  const subtype = classifyExecutorSubtype(task)
  return { lane, subtype, reason }
}
