/**
 * build-safety-gate.ts — Phase 7.7 WS1 + WS3
 *
 * Pre-commit build safety gate.  Runs BEFORE commitFilesToGitHub() in the
 * agent/generate route.  If the gate fails, the task is blocked and NO commit
 * is made to GitHub — the live deploy branch is never poisoned.
 *
 * WS1 Checks:
 *   1. TypeScript / syntax sanity  — error markers, severe imbalance, etc.
 *   2. Import / path sanity        — detects obviously broken import patterns
 *   3. Next.js route/export sanity — page files need default export, API routes need named export
 *   4. Minimal build validation    — forbidden patterns that always break a Next.js build
 *
 * WS3 Protected file detection:
 *   Files in PROTECTED_SCAFFOLD_FILES must not be overwritten by agent tasks
 *   unless the task is explicitly typed to handle them.
 *
 * Model: FAIL-BY-DEFAULT — unknown/ambiguous state is never treated as safe.
 */

// ─────────────────────────────────────────────────────────────────────────────
// WS3: Protected scaffold / core files
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Files that agents must NOT overwrite unless the task is of an explicitly
 * compatible type (scaffold / bootstrap / infra-only).  These files are
 * the skeleton that Vercel requires to build successfully.
 */
export const PROTECTED_SCAFFOLD_FILES: string[] = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'tsconfig.json',
  'tsconfig.base.json',
  '.eslintrc.json',
  '.eslintrc.js',
  'src/app/layout.tsx',
  'src/app/layout.jsx',
  'app/layout.tsx',
  'app/layout.jsx',
  'src/app/page.tsx',
  'src/app/page.jsx',
  'app/page.tsx',
  'app/page.jsx',
  'src/app/(dashboard)/layout.tsx',
  'src/app/(dashboard)/layout.jsx',
  'middleware.ts',
  'middleware.js',
  'src/middleware.ts',
  'src/middleware.js',
  '.env',
  '.env.local',
  '.env.production',
  '.env.example',
  'vercel.json',
  'src/lib/supabase/server.ts',
  'src/lib/supabase/client.ts',
  'lib/supabase/server.ts',
  'lib/supabase/client.ts',
]

/**
 * Task types that are explicitly allowed to touch scaffold/core files.
 * All other task types are rejected with a PROTECTED_FILE_VIOLATION.
 */
const SCAFFOLD_ALLOWED_TASK_TYPES = new Set([
  'scaffold',
  'bootstrap',
  'infrastructure',
  'infra',
  'config',
  'migration',  // migration SQL is fine; TS config is not
])

// ─────────────────────────────────────────────────────────────────────────────
// WS1: TypeScript / syntax sanity markers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard error markers — if any file's content contains one of these, it is
 * definitively broken and will cause a build failure.
 */
const HARD_SYNTAX_FAILURE_MARKERS: string[] = [
  'SyntaxError:',
  'COMPILATION_ERROR',
  'BUILD_FAILED',
  'Failed to compile',
  'Unexpected token',
  'unterminated string',
  'Unexpected end of JSON',
  'TS2304:', // Cannot find name
  'TS2305:', // Module has no exported member
  'TS2307:', // Cannot find module
  'TS2345:', // Argument type mismatch
  'TS2551:', // Property does not exist (did you mean...)
  'error TS',  // Generic TypeScript compilation error
]

/**
 * Patterns in TypeScript/TSX content that always break Next.js builds.
 */
const BUILD_BREAKING_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  // Duplicate 'use client' / 'use server' directives (often from badly merged outputs)
  { label: 'duplicate-use-client', pattern: /["']use client["']\s*\n[\s\S]*?["']use client["']/ },
  { label: 'duplicate-use-server', pattern: /["']use server["']\s*\n[\s\S]*?["']use server["']/ },
  // Conflicting directives in same file
  { label: 'conflicting-directives', pattern: /["']use client["'][\s\S]*?["']use server["']|["']use server["'][\s\S]*?["']use client["']/ },
  // Bare require() in ESM-only file (next.config.mjs context)
  { label: 'require-in-esm', pattern: /^(?!.*["']use client["']).*\brequire\s*\(\s*["'][^"']+["']\s*\)/m },
]

/**
 * Next.js page file paths — these MUST export a default function/component.
 * Agent output missing the default export will cause a build error in Next 14+.
 */
const NEXTJS_PAGE_PATH_PATTERNS: RegExp[] = [
  /^(?:src\/)?app\/.*\/page\.[jt]sx?$/,
  /^(?:src\/)?app\/page\.[jt]sx?$/,
  /^(?:src\/)?pages\/.*\.[jt]sx?$/,  // pages router
]

/**
 * Next.js App Router API route paths — must export at least one named HTTP method.
 */
const NEXTJS_API_ROUTE_PATTERNS: RegExp[] = [
  /^(?:src\/)?app\/.*\/route\.[jt]sx?$/,
  /^(?:src\/)?app\/api\/.*\/route\.[jt]sx?$/,
]

const HTTP_METHOD_EXPORT = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/

const DEFAULT_EXPORT_PATTERN = /export\s+default\s+/

// ─────────────────────────────────────────────────────────────────────────────
// Check types
// ─────────────────────────────────────────────────────────────────────────────

export type SafetyCheckName =
  | 'syntax_sanity'
  | 'import_path_sanity'
  | 'nextjs_route_export'
  | 'protected_file'
  | 'build_breaking_pattern'

export interface SafetyCheckResult {
  check: SafetyCheckName
  passed: boolean
  detail: string
  affectedFile?: string
}

export interface BuildSafetyGateResult {
  passed: boolean
  /** Human-readable failure reason (first failing check) */
  reason: string
  /** All check results */
  checks: SafetyCheckResult[]
  /** Failure category for task.failure_category */
  failureCategory?: 'build_safety_gate' | 'protected_file_violation'
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual check functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WS3: Protected file detection.
 * Returns FAIL if any file in the commit targets a protected scaffold file
 * and the task type is not scaffold/infra.
 */
function checkProtectedFiles(
  files: Array<{ path: string; content: string }>,
  taskType?: string,
): SafetyCheckResult {
  const check: SafetyCheckName = 'protected_file'

  // Normalize task type
  const normalizedType = (taskType ?? '').toLowerCase().trim()
  const isAllowedType = SCAFFOLD_ALLOWED_TASK_TYPES.has(normalizedType)

  if (isAllowedType) {
    return {
      check,
      passed: true,
      detail: `Task type '${taskType}' is explicitly allowed to modify scaffold files`,
    }
  }

  const violations: string[] = []
  for (const file of files) {
    // Normalize path for comparison
    const normalizedPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '')
    const isProtected = PROTECTED_SCAFFOLD_FILES.some(p => {
      // Exact match or path suffix match (handle absolute paths from agents)
      return normalizedPath === p || normalizedPath.endsWith('/' + p) || normalizedPath === '/' + p
    })
    if (isProtected) {
      violations.push(file.path)
    }
  }

  if (violations.length > 0) {
    return {
      check,
      passed: false,
      detail: `WS3-PROTECTED: Agent attempted to overwrite scaffold/core file(s): ${violations.join(', ')}. ` +
        `Only task types [${Array.from(SCAFFOLD_ALLOWED_TASK_TYPES).join(', ')}] may modify these files. ` +
        `Task type was: '${taskType ?? 'unknown'}'. Commit blocked.`,
      affectedFile: violations[0],
    }
  }

  return {
    check,
    passed: true,
    detail: `No protected scaffold file violations in ${files.length} file(s)`,
  }
}

/**
 * WS1: TypeScript / syntax sanity check.
 * Scans file content for hard error markers that indicate the code is already
 * broken (e.g., agent output was a compiler error, not valid code).
 */
function checkSyntaxSanity(
  files: Array<{ path: string; content: string }>,
): SafetyCheckResult {
  const check: SafetyCheckName = 'syntax_sanity'

  for (const file of files) {
    // Only check TypeScript/JavaScript files
    if (!/\.[jt]sx?$/.test(file.path)) continue

    const content = file.content ?? ''
    if (content.length === 0) continue

    // Hard failure markers
    const failMarker = HARD_SYNTAX_FAILURE_MARKERS.find(m => content.includes(m))
    if (failMarker) {
      return {
        check,
        passed: false,
        detail: `WS1-SYNTAX: File '${file.path}' contains hard failure marker: "${failMarker}". ` +
          `This indicates agent output is a compiler error, not valid code. Commit blocked.`,
        affectedFile: file.path,
      }
    }

    // Severe brace imbalance (catches truncated code blocks)
    // Only flag if file is reasonably large and imbalance is extreme (> 10 unmatched)
    if (content.length > 200) {
      const openBraces = (content.match(/\{/g) ?? []).length
      const closeBraces = (content.match(/\}/g) ?? []).length
      const imbalance = Math.abs(openBraces - closeBraces)
      if (imbalance > 15) {
        return {
          check,
          passed: false,
          detail: `WS1-SYNTAX: File '${file.path}' has severe brace imbalance (${openBraces} open, ${closeBraces} close — delta ${imbalance}). ` +
            `Code is likely truncated or malformed. Commit blocked.`,
          affectedFile: file.path,
        }
      }
    }
  }

  return {
    check,
    passed: true,
    detail: `Syntax sanity: ${files.filter(f => /\.[jt]sx?$/.test(f.path)).length} TS/JS file(s) passed`,
  }
}

/**
 * WS1: Import / path sanity check.
 * Detects obviously broken import patterns in TypeScript output.
 */
function checkImportPathSanity(
  files: Array<{ path: string; content: string }>,
): SafetyCheckResult {
  const check: SafetyCheckName = 'import_path_sanity'

  // Forbidden import patterns that always cause build failures
  const FORBIDDEN_IMPORT_TARGETS: Array<{ label: string; pattern: RegExp }> = [
    // Imports from .js files that obviously don't exist in a TS project
    { label: 'bad-js-extension', pattern: /from\s+['"][^'"]*\.js['"]/g },
    // Circular self-imports (file importing itself)
    // Handled per-file below
    // Bare module imports with path separators (confused agent output)
    { label: 'malformed-import', pattern: /from\s+['"]\s+['"]/g },
    // Import from undefined / null (literal)
    { label: 'import-from-undefined', pattern: /from\s+['"]undefined['"]/g },
    { label: 'import-from-null', pattern: /from\s+['"]null['"]/g },
  ]

  for (const file of files) {
    if (!/\.[jt]sx?$/.test(file.path)) continue
    const content = file.content ?? ''
    if (content.length === 0) continue

    for (const { label, pattern } of FORBIDDEN_IMPORT_TARGETS) {
      // Skip .js extension check for files that ARE JS
      if (label === 'bad-js-extension' && file.path.endsWith('.js')) continue
      if (pattern.test(content)) {
        // Reset regex lastIndex
        pattern.lastIndex = 0
        return {
          check,
          passed: false,
          detail: `WS1-IMPORT: File '${file.path}' contains forbidden import pattern '${label}'. ` +
            `This will cause a build failure. Commit blocked.`,
          affectedFile: file.path,
        }
      }
      pattern.lastIndex = 0
    }
  }

  return {
    check,
    passed: true,
    detail: `Import sanity: no broken import patterns detected`,
  }
}

/**
 * WS1: Next.js route/export sanity check.
 * - Page files (page.tsx) must have a default export
 * - API route files (route.ts) must have at least one named HTTP method export
 */
function checkNextJsExports(
  files: Array<{ path: string; content: string }>,
): SafetyCheckResult {
  const check: SafetyCheckName = 'nextjs_route_export'

  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '')
    const content = file.content ?? ''
    if (content.length === 0) continue

    // Page file: must have default export
    const isPageFile = NEXTJS_PAGE_PATH_PATTERNS.some(p => p.test(normalizedPath))
    if (isPageFile) {
      if (!DEFAULT_EXPORT_PATTERN.test(content)) {
        return {
          check,
          passed: false,
          detail: `WS1-EXPORT: Page file '${file.path}' is missing 'export default'. ` +
            `Next.js 14 requires a default export for all page components. Commit blocked.`,
          affectedFile: file.path,
        }
      }
    }

    // API route file: must have at least one HTTP method export
    const isApiRoute = NEXTJS_API_ROUTE_PATTERNS.some(p => p.test(normalizedPath))
    if (isApiRoute) {
      if (!HTTP_METHOD_EXPORT.test(content)) {
        return {
          check,
          passed: false,
          detail: `WS1-EXPORT: API route file '${file.path}' is missing a named HTTP method export (GET, POST, PUT, PATCH, DELETE, etc.). ` +
            `Next.js 14 App Router requires at least one exported handler. Commit blocked.`,
          affectedFile: file.path,
        }
      }
    }
  }

  return {
    check,
    passed: true,
    detail: `Next.js route/export sanity: all page and route files have correct exports`,
  }
}

/**
 * WS1: Build-breaking pattern check.
 * Detects patterns that are structurally valid TS but always cause Next.js build failures.
 */
function checkBuildBreakingPatterns(
  files: Array<{ path: string; content: string }>,
): SafetyCheckResult {
  const check: SafetyCheckName = 'build_breaking_pattern'

  for (const file of files) {
    if (!/\.[jt]sx?$/.test(file.path)) continue
    const content = file.content ?? ''
    if (content.length === 0) continue

    for (const { label, pattern } of BUILD_BREAKING_PATTERNS) {
      // Skip require-in-esm for non-.mjs files (it's valid in CJS contexts)
      if (label === 'require-in-esm' && !file.path.endsWith('.mjs')) continue

      if (pattern.test(content)) {
        return {
          check,
          passed: false,
          detail: `WS1-BUILD: File '${file.path}' contains build-breaking pattern '${label}'. ` +
            `This pattern is known to cause Next.js build failures. Commit blocked.`,
          affectedFile: file.path,
        }
      }
    }
  }

  return {
    check,
    passed: true,
    detail: `Build-breaking pattern scan: ${files.filter(f => /\.[jt]sx?$/.test(f.path)).length} file(s) clean`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main gate function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * runBuildSafetyGate — WS1 + WS3 pre-commit gate.
 *
 * Call this BEFORE commitFilesToGitHub().  If result.passed === false, the
 * task must be blocked and no commit should be made.
 *
 * @param files     Array of { path, content } for all files being committed
 * @param taskType  Optional task type string (used for WS3 protected-file check)
 */
export function runBuildSafetyGate(
  files: Array<{ path: string; content: string }>,
  taskType?: string,
): BuildSafetyGateResult {
  if (!files || files.length === 0) {
    // No files: nothing to check, vacuously safe
    return {
      passed: true,
      reason: 'No files to validate',
      checks: [],
    }
  }

  const checks: SafetyCheckResult[] = []

  // WS3: Protected file check — run first (fastest rejection path)
  const protectedCheck = checkProtectedFiles(files, taskType)
  checks.push(protectedCheck)
  if (!protectedCheck.passed) {
    return {
      passed: false,
      reason: protectedCheck.detail,
      checks,
      failureCategory: 'protected_file_violation',
    }
  }

  // WS1: Syntax sanity
  const syntaxCheck = checkSyntaxSanity(files)
  checks.push(syntaxCheck)
  if (!syntaxCheck.passed) {
    return {
      passed: false,
      reason: syntaxCheck.detail,
      checks,
      failureCategory: 'build_safety_gate',
    }
  }

  // WS1: Import/path sanity
  const importCheck = checkImportPathSanity(files)
  checks.push(importCheck)
  if (!importCheck.passed) {
    return {
      passed: false,
      reason: importCheck.detail,
      checks,
      failureCategory: 'build_safety_gate',
    }
  }

  // WS1: Next.js route/export sanity
  const exportCheck = checkNextJsExports(files)
  checks.push(exportCheck)
  if (!exportCheck.passed) {
    return {
      passed: false,
      reason: exportCheck.detail,
      checks,
      failureCategory: 'build_safety_gate',
    }
  }

  // WS1: Build-breaking patterns
  const buildPatternCheck = checkBuildBreakingPatterns(files)
  checks.push(buildPatternCheck)
  if (!buildPatternCheck.passed) {
    return {
      passed: false,
      reason: buildPatternCheck.detail,
      checks,
      failureCategory: 'build_safety_gate',
    }
  }

  return {
    passed: true,
    reason: 'All build safety checks passed',
    checks,
  }
}
