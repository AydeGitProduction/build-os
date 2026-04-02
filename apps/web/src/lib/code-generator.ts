/**
 * code-generator.ts — ERT-P3 C1-BE
 * Code generation contract: task-type to file mapping and generation service.
 * Maps agent roles to allowed file paths, extracts code blocks from agent
 * outputs, and converts them to PatchOperations for the PatchEngine.
 */

import { PatchOperation } from './patch-engine'
import type { GenerationStatus } from './types'
export type { GenerationStatus }

// ─────────────────────────────────────────────────────────────────────────────
// Supported languages and statuses
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'sql'
  | 'bash'
  | 'go'
  | 'rust'
  | 'json'
  | 'yaml'
  | 'unknown'

// GenerationStatus re-exported from types.ts (canonical definition there)

// ─────────────────────────────────────────────────────────────────────────────
// Role-to-path configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface RolePathConfig {
  baseDir: string
  testDir: string
  defaultExtension: string
  migrationDir: string | null
  allowedPaths: string[]
  compilationRequired: boolean
}

export const ROLE_TO_PATH_MAP: Record<string, RolePathConfig> = {
  backend_engineer: {
    baseDir: 'src/lib',
    testDir: 'src/lib/__tests__',
    defaultExtension: '.ts',
    migrationDir: 'migrations',
    allowedPaths: ['src/lib/**', 'src/services/**', 'src/middleware/**', 'migrations/**', 'src/types/**'],
    compilationRequired: true,
  },
  frontend_engineer: {
    baseDir: 'src/components',
    testDir: 'src/components/__tests__',
    defaultExtension: '.tsx',
    migrationDir: null,
    allowedPaths: [
      'src/components/**',
      'src/pages/**',
      'src/hooks/**',
      'src/styles/**',
      'src/utils/**',
      'src/types/**',
      'src/app/**',
      'src/contexts/**',
      'src/store/**',
    ],
    compilationRequired: true,
  },
  data_engineer: {
    baseDir: 'src/data',
    testDir: 'src/data/__tests__',
    defaultExtension: '.py',
    migrationDir: 'migrations/data',
    allowedPaths: ['src/data/**', 'src/pipelines/**', 'migrations/data/**', 'scripts/etl/**'],
    compilationRequired: false,
  },
  devops_engineer: {
    baseDir: 'infrastructure',
    testDir: 'infrastructure/__tests__',
    defaultExtension: '.sh',
    migrationDir: null,
    allowedPaths: ['infrastructure/**', 'docker/**', '.github/workflows/**', 'scripts/**', 'terraform/**'],
    compilationRequired: false,
  },
  database_engineer: {
    baseDir: 'migrations',
    testDir: 'migrations/__tests__',
    defaultExtension: '.sql',
    migrationDir: 'migrations',
    allowedPaths: ['migrations/**', 'seeds/**', 'schemas/**'],
    compilationRequired: false,
  },
  ml_engineer: {
    baseDir: 'src/ml',
    testDir: 'src/ml/__tests__',
    defaultExtension: '.py',
    migrationDir: null,
    allowedPaths: ['src/ml/**', 'notebooks/**', 'models/**', 'src/inference/**'],
    compilationRequired: false,
  },
  security_engineer: {
    baseDir: 'src/security',
    testDir: 'src/security/__tests__',
    defaultExtension: '.ts',
    migrationDir: null,
    allowedPaths: ['src/security/**', 'src/middleware/auth/**', 'src/validators/**', 'policies/**'],
    compilationRequired: true,
  },
  platform_engineer: {
    baseDir: 'src/platform',
    testDir: 'src/platform/__tests__',
    defaultExtension: '.ts',
    migrationDir: 'migrations/platform',
    allowedPaths: ['src/platform/**', 'src/config/**', 'src/registry/**', 'migrations/platform/**'],
    compilationRequired: true,
  },
  architect: {
    baseDir: 'docs/architecture',
    testDir: 'docs/architecture/__tests__',
    defaultExtension: '.md',
    migrationDir: null,
    allowedPaths: ['docs/**', 'specs/**', 'architecture/**'],
    compilationRequired: false,
  },
  qa_security_auditor: {
    baseDir: 'tests',
    testDir: 'tests',
    defaultExtension: '.ts',
    migrationDir: null,
    allowedPaths: ['tests/**', 'e2e/**', 'fixtures/**'],
    compilationRequired: false,
  },
  integration_engineer: {
    baseDir: 'src/integrations',
    testDir: 'src/integrations/__tests__',
    defaultExtension: '.ts',
    migrationDir: null,
    allowedPaths: ['src/integrations/**', 'config/**', 'src/webhooks/**'],
    compilationRequired: true,
  },
  qa_engineer: {
    baseDir: 'tests',
    testDir: 'tests',
    defaultExtension: '.ts',
    migrationDir: null,
    allowedPaths: ['tests/**', 'e2e/**', 'fixtures/**', 'src/**'],
    compilationRequired: false,
  },
  full_stack_engineer: {
    baseDir: 'src',
    testDir: 'src/__tests__',
    defaultExtension: '.ts',
    migrationDir: 'migrations',
    allowedPaths: ['src/**', 'migrations/**', 'tests/**', 'public/**'],
    compilationRequired: true,
  },
  software_engineer: {
    baseDir: 'src',
    testDir: 'src/__tests__',
    defaultExtension: '.ts',
    migrationDir: null,
    allowedPaths: ['src/**', 'tests/**', 'migrations/**'],
    compilationRequired: true,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Code block extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedCodeBlock {
  language: SupportedLanguage
  code: string
  filename: string | null
  startLine: number
  endLine: number
}

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
}

function normalizeLanguage(lang: string): SupportedLanguage {
  const lower = lang.toLowerCase().trim()
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower]
  const valid: SupportedLanguage[] = ['typescript', 'javascript', 'python', 'sql', 'bash', 'go', 'rust', 'json', 'yaml']
  return valid.includes(lower as SupportedLanguage) ? (lower as SupportedLanguage) : 'unknown'
}

// Monorepo path prefixes to strip when agents return full workspace-relative paths.
// e.g. "apps/web/src/lib/foo.ts" → "src/lib/foo.ts"
const MONOREPO_STRIP_PREFIXES = [
  'apps/web/',
  'app/web/',
  'packages/web/',
]

function stripMonorepoPrefix(filePath: string): string {
  for (const prefix of MONOREPO_STRIP_PREFIXES) {
    if (filePath.startsWith(prefix)) {
      return filePath.slice(prefix.length)
    }
  }
  return filePath
}

// Extract filename from comment in first line of code block
// Looks for patterns like: `// src/lib/foo.ts` or `# src/lib/foo.py`
function extractFilenameFromCode(code: string): string | null {
  const firstLine = code.split('\n')[0].trim()
  const patterns = [
    /^\/\/\s+([\w./\-]+\.\w+)/, // TypeScript/JS comment
    /^#\s+([\w./\-]+\.\w+)/,     // Python/Bash comment
    /^--\s+([\w./\-]+\.\w+)/,    // SQL comment
    /^\/\*\*?\s*([\w./\-]+\.\w+)/,
  ]
  for (const pattern of patterns) {
    const match = firstLine.match(pattern)
    if (match) return stripMonorepoPrefix(match[1])
  }
  return null
}

export function extractCodeBlocks(rawText: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = []
  // Match fenced code blocks: ```lang [optional filename]\n...code...\n```
  const fenceRegex = /^```(\w+)?(?:\s+([\w./\-]+))?\s*\n([\s\S]*?)^```/gm
  let match: RegExpExecArray | null

  const lines = rawText.split('\n')

  while ((match = fenceRegex.exec(rawText)) !== null) {
    const langStr = match[1] ?? 'unknown'
    const inlineFilename = match[2] ?? null
    const code = match[3]

    // Calculate line numbers
    const beforeMatch = rawText.substring(0, match.index)
    const startLine = beforeMatch.split('\n').length
    const endLine = startLine + code.split('\n').length + 1

    const language = normalizeLanguage(langStr)
    const filename = inlineFilename ?? extractFilenameFromCode(code)

    blocks.push({ language, code: code.trimEnd(), filename, startLine, endLine })
  }

  return blocks
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function globMatch(pattern: string, path: string): boolean {
  // Simple glob: ** matches anything, * matches within a segment
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '__DOUBLE__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE__/g, '.*')
  return new RegExp(`^${regexStr}$`).test(path)
}

export function validateFilePath(filePath: string, role: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const config = ROLE_TO_PATH_MAP[role]
  if (!config) {
    warnings.push(`Unknown role "${role}" — skipping path validation`)
    return { valid: true, errors, warnings }
  }

  if (filePath.includes('..') || filePath.startsWith('/')) {
    errors.push(`Path "${filePath}" is not allowed: must be relative with no traversal`)
    return { valid: false, errors, warnings }
  }

  const isAllowed = config.allowedPaths.some((pattern) => globMatch(pattern, filePath))
  if (!isAllowed) {
    errors.push(
      `Path "${filePath}" is outside allowed directories for role "${role}". ` +
        `Allowed: ${config.allowedPaths.join(', ')}`,
    )
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─────────────────────────────────────────────────────────────────────────────
// Code generation output → PatchOperation mapping
// ─────────────────────────────────────────────────────────────────────────────

export interface CodeGenerationOutput {
  operations: PatchOperation[]
  language: SupportedLanguage
  summary: string
  compilation_expected: boolean
  target_files: string[]
  validation: ValidationResult
}

export function codeBlockToPatchOperation(
  block: ExtractedCodeBlock,
  role: string,
  existingFilePaths: Set<string>,
): PatchOperation | null {
  if (!block.filename) return null

  const config = ROLE_TO_PATH_MAP[role]
  let filePath = block.filename

  // If filename has no directory, prepend the role's base dir
  if (!filePath.includes('/') && config) {
    filePath = `${config.baseDir}/${filePath}`
  }

  if (existingFilePaths.has(filePath)) {
    // File exists — use append (safe, non-destructive default)
    return {
      type: 'append',
      file_path: filePath,
      content: '\n' + block.code,
      ensure_newline: true,
    }
  } else {
    // New file — use create
    return {
      type: 'create',
      file_path: filePath,
      content: block.code,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main service function
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerationServiceInput {
  rawAgentOutput: string
  agentRole: string
  taskId: string
  existingFilePaths?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON file-list fallback extractor
// ─────────────────────────────────────────────────────────────────────────────
// When agents return JSON (current default prompt), attempt to extract file
// operations from common JSON schemas produced by code agents.
// Handles: { files: [{path, content}] }, { code: { files: [] } }, [{file_path, content}]

interface JsonFileEntry {
  path?: string
  file_path?: string
  filePath?: string
  content?: string
  code?: string
  body?: string
  operation?: string
}

function tryExtractCodeBlocksFromJson(rawOutput: string): ExtractedCodeBlock[] {
  // First unwrap {content, format:'markdown'} wrapper from n8n parse step
  let text = rawOutput
  try {
    const outer = JSON.parse(rawOutput)
    if (outer && typeof outer === 'object' && !Array.isArray(outer)) {
      if (typeof outer.content === 'string') {
        // n8n wrapped markdown: inner text may have code blocks
        const innerBlocks = extractCodeBlocks(outer.content)
        if (innerBlocks.length > 0) return innerBlocks
        // Otherwise fall through and try to parse inner content as JSON
        text = outer.content
      }
    }
  } catch { /* not JSON — leave text as-is */ }

  // Try to parse the (possibly unwrapped) text as JSON file list
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return [] }

  const entries: JsonFileEntry[] = []

  if (Array.isArray(parsed)) {
    entries.push(...(parsed as JsonFileEntry[]))
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    // { files: [...] } or { code: { files: [...] } }
    // Support { files: [...] }, { code: { files: [...] } }, and { output: { files: [...] } }
    // The last form is produced by backend_engineer when callers pass the full parsed structure
    const outputObj = obj.output as Record<string, unknown> | null | undefined
    const files =
      obj.files ??
      (obj.code as Record<string, unknown> | null)?.files ??
      outputObj?.files
    if (Array.isArray(files)) entries.push(...(files as JsonFileEntry[]))
    // { "src/lib/foo.ts": "content" }
    else {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string' && key.includes('/') && key.includes('.')) {
          entries.push({ path: key, content: val })
        }
      }
    }
  }

  return entries
    .map((e, i): ExtractedCodeBlock | null => {
      const rawPath = e.path ?? e.file_path ?? e.filePath
      const content = e.content ?? e.code ?? e.body
      if (!rawPath || !content) return null
      const filePath = stripMonorepoPrefix(rawPath)
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const lang = normalizeLanguage(ext)
      return {
        language: lang,
        code: `// ${filePath}\n${content}`,
        filename: filePath,
        startLine: i * 10,
        endLine: i * 10 + 5,
      }
    })
    .filter((b): b is ExtractedCodeBlock => b !== null)
}

export function parseAgentOutputToOperations(input: GenerationServiceInput): CodeGenerationOutput {
  const { rawAgentOutput, agentRole, existingFilePaths = [] } = input
  const existingSet = new Set(existingFilePaths)

  // Try code blocks first; fall back to JSON file-list extraction
  let blocks = extractCodeBlocks(rawAgentOutput)
  if (blocks.length === 0) {
    blocks = tryExtractCodeBlocksFromJson(rawAgentOutput)
  }

  const operations: PatchOperation[] = []
  const targetFiles: string[] = []
  const allErrors: string[] = []
  const allWarnings: string[] = []

  const config = ROLE_TO_PATH_MAP[agentRole]
  const compilationExpected = config?.compilationRequired ?? false

  // Determine primary language from first named block
  const primaryLang: SupportedLanguage =
    blocks.find((b) => b.language !== 'unknown')?.language ?? 'unknown'

  for (const block of blocks) {
    if (!block.filename) {
      allWarnings.push(
        `Code block at line ${block.startLine} has no filename — skipped. ` +
          `Add a filename comment (e.g. "// src/lib/foo.ts") to the first line.`,
      )
      continue
    }

    // Validate path against role
    const validation = validateFilePath(block.filename, agentRole)
    allErrors.push(...validation.errors)
    allWarnings.push(...validation.warnings)

    if (!validation.valid) continue

    const op = codeBlockToPatchOperation(block, agentRole, existingSet)
    if (op) {
      operations.push(op)
      targetFiles.push(op.file_path)
      // Mark as existing so subsequent blocks for the same file use append
      existingSet.add(op.file_path)
    }
  }

  const blockCount = blocks.length
  const opCount = operations.length

  return {
    operations,
    language: primaryLang,
    summary: `Extracted ${blockCount} code block(s), generated ${opCount} patch operation(s) for role "${agentRole}"`,
    compilation_expected: compilationExpected,
    target_files: targetFiles,
    validation: {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    },
  }
}
