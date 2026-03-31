/**
 * BUILD OS — P11.6 Integration Test Runner
 *
 * Tests all critical endpoints against production.
 * Classifies each route as FULLY_REAL (FR) or CNV based on response.
 *
 * Usage: npx ts-node scripts/integration-test.ts
 *
 * Required env vars:
 *   PRODUCTION_URL=https://web-lake-one-88.vercel.app
 *   BUILDOS_SECRET=<secret>   (for admin routes)
 */

const BASE_URL = process.env.PRODUCTION_URL || 'https://web-lake-one-88.vercel.app'
const SECRET = process.env.BUILDOS_SECRET || ''
const PROJECT_ID = 'feb25dda-6352-42fa-bac8-f4a7104f7b8c'
const KNOWN_TASK_ID = '8c1123be-849f-45a0-aff2-f44f68e7380b'

interface TestResult {
  route: string
  method: string
  status: number
  classification: 'FR' | 'CNV' | 'BLOCKED'
  note: string
}

const results: TestResult[] = []

async function probe(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown; expectStatuses?: number[] } = {}
): Promise<TestResult> {
  const url = `${BASE_URL}${path}`
  const expectStatuses = opts.expectStatuses || [200, 201, 400, 401, 403, 307]

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: 'manual',
    })

    const isExpected = expectStatuses.includes(res.status) || (res.status >= 300 && res.status < 400)
    const is404 = res.status === 404

    let note = `HTTP ${res.status}`
    let classification: 'FR' | 'CNV' | 'BLOCKED' = 'CNV'

    if (!is404 && isExpected) {
      classification = 'FR'
      note = `HTTP ${res.status} ✓`
    } else if (is404) {
      classification = 'CNV'
      note = `HTTP 404 ✗ — route missing`
    } else {
      classification = 'BLOCKED'
      note = `HTTP ${res.status} — unexpected`
    }

    const result = { route: path, method, status: res.status, classification, note }
    results.push(result)
    const icon = classification === 'FR' ? '✅' : classification === 'CNV' ? '❌' : '⚠️'
    console.log(`${icon} ${method} ${path} → ${note}`)
    return result
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const result = { route: path, method, status: 0, classification: 'CNV' as const, note: `ERROR: ${errMsg}` }
    results.push(result)
    console.log(`❌ ${method} ${path} → ERROR: ${errMsg}`)
    return result
  }
}

async function runAll() {
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  BUILD OS — P11.6 Integration Test Suite')
  console.log(`  Target: ${BASE_URL}`)
  console.log('═══════════════════════════════════════════════════\n')

  // ── WS2: Orchestration Routes ──────────────────────────────────────────────
  console.log('── WS2: Orchestration Routes ──')
  await probe('GET', `/api/orchestrate/status?project_id=${PROJECT_ID}`)
  await probe('GET', `/api/orchestrate/watchdog`)
  await probe('POST', `/api/orchestrate/tick`, { body: { project_id: PROJECT_ID } })
  await probe('POST', `/api/orchestrate/recovery`, { body: { project_id: PROJECT_ID } })
  await probe('POST', `/api/orchestrate/safe-stop`, { body: { project_id: PROJECT_ID } })
  await probe('POST', `/api/orchestrate/activate`, { body: { project_id: PROJECT_ID } })

  // ── WS2: Routing Intelligence ──────────────────────────────────────────────
  console.log('\n── WS2: Routing Intelligence ──')
  await probe('POST', `/api/routing/classify`, { body: { task_id: KNOWN_TASK_ID } })
  await probe('GET', `/api/routing/rules`)
  await probe('GET', `/api/routing/decisions`)
  await probe('GET', `/api/routing/metrics`)

  // ── WS2: Agent + Dispatch ──────────────────────────────────────────────────
  console.log('\n── WS2: Agent + Dispatch ──')
  await probe('POST', `/api/agent/generate`, { body: { task_id: KNOWN_TASK_ID, raw_output: 'test' } })
  await probe('POST', `/api/agent/execute`, { body: { task_id: KNOWN_TASK_ID } })
  await probe('POST', `/api/agent/output`, { body: { task_id: KNOWN_TASK_ID, output: 'test' } })
  await probe('POST', `/api/dispatch/task`, { body: { task_id: KNOWN_TASK_ID } })

  // ── WS2: Projects + Provisioning ──────────────────────────────────────────
  console.log('\n── WS2: Projects + Provisioning ──')
  await probe('GET', `/api/projects`)
  await probe('GET', `/api/projects/${PROJECT_ID}`)
  await probe('GET', `/api/projects/${PROJECT_ID}/blueprint`)
  await probe('POST', `/api/projects/${PROJECT_ID}/provision`, { body: {} })
  await probe('GET', `/api/projects/${PROJECT_ID}/tasks`)

  // ── WS2: Cost + QA ────────────────────────────────────────────────────────
  console.log('\n── WS2: Cost + QA ──')
  await probe('POST', `/api/cost/event`, { body: { task_id: KNOWN_TASK_ID, cost: 0.01, model: 'test' } })
  await probe('POST', `/api/qa/verdict`, { body: { task_id: KNOWN_TASK_ID } })
  await probe('GET', `/api/release/check`)

  // ── WS2: Blockers + Documents ─────────────────────────────────────────────
  console.log('\n── WS2: Blockers + Documents ──')
  await probe('GET', `/api/blockers`)
  await probe('GET', `/api/documents`)
  await probe('GET', `/api/supervisor`)

  // ── WS3: Wizard Flow ──────────────────────────────────────────────────────
  console.log('\n── WS3: Wizard Flow ──')
  await probe('GET', `/api/wizard/session`)
  await probe('POST', `/api/wizard/session`, { body: { project_id: PROJECT_ID } })
  await probe('POST', `/api/iris/chat`, { body: { message: 'test', project_id: PROJECT_ID } })
  await probe('GET', `/api/wizard-state?project_id=${PROJECT_ID}`)
  await probe('GET', `/api/wizard-readiness?project_id=${PROJECT_ID}`)
  await probe('GET', `/api/wizard-assumptions`)
  await probe('POST', `/api/wizard-assumptions`, { body: { project_id: PROJECT_ID, content: 'test assumption' } })

  // ── WS4: Eval Engine ──────────────────────────────────────────────────────
  console.log('\n── WS4: Eval Engine ──')
  await probe('POST', `/api/evaluate/task`, {
    headers: { 'X-Buildos-Secret': SECRET },
    body: { task_id: KNOWN_TASK_ID },
  })

  // ── WS2: Integrations ─────────────────────────────────────────────────────
  console.log('\n── WS2: Integrations ──')
  await probe('GET', `/api/integrations/github/connect`)
  await probe('GET', `/api/integrations/github/callback`)
  await probe('GET', `/api/integrations/providers`)
  await probe('POST', `/api/integrations/connect`, { body: { provider: 'github' } })

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const frCount = results.filter(r => r.classification === 'FR').length
  const cnvCount = results.filter(r => r.classification === 'CNV').length
  const blockedCount = results.filter(r => r.classification === 'BLOCKED').length
  const total = results.length

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  RESULTS: ${frCount}/${total} FULLY_REAL`)
  console.log(`  FR: ${frCount} | CNV (404): ${cnvCount} | Unexpected: ${blockedCount}`)
  console.log('═══════════════════════════════════════════════════\n')

  // Print CNV routes
  const cnvRoutes = results.filter(r => r.classification === 'CNV')
  if (cnvRoutes.length > 0) {
    console.log('Routes returning 404 (need replay):')
    cnvRoutes.forEach(r => console.log(`  ❌ ${r.method} ${r.route}`))
  }

  return { frCount, cnvCount, blockedCount, total, results }
}

runAll().catch(console.error)
