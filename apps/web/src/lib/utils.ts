// ─── Utility Helpers ──────────────────────────────────────────────────────────

/** Convert a string to a URL-safe slug */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Format a date string to a readable format */
export function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** Format a relative date (e.g. "2 days ago") */
export function formatRelative(date: string | null): string {
  if (!date) return '—'
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60)       return 'just now'
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800)   return `${Math.floor(diff / 86400)}d ago`
  return formatDate(date)
}

/** Format a number as USD */
export function formatUSD(amount: number | null, decimals = 2): string {
  if (amount === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

/** Calculate percentage */
export function percentage(part: number, total: number): number {
  if (total === 0) return 0
  return Math.round((part / total) * 100)
}

/** Clamp a value between min and max */
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}

/** Capitalise first letter */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Convert snake_case to Title Case */
export function snakeToTitle(s: string): string {
  return s.split('_').map(capitalize).join(' ')
}

/** Truncate text to a max length */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

/** Status colour mapping for tasks */
export const TASK_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pending:         { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  ready:           { bg: 'bg-blue-50',   text: 'text-blue-600',  dot: 'bg-blue-400' },
  dispatched:      { bg: 'bg-indigo-50', text: 'text-indigo-600',dot: 'bg-indigo-400' },
  in_progress:     { bg: 'bg-amber-50',  text: 'text-amber-700', dot: 'bg-amber-400' },
  awaiting_review: { bg: 'bg-purple-50', text: 'text-purple-600',dot: 'bg-purple-400' },
  in_qa:           { bg: 'bg-orange-50', text: 'text-orange-600',dot: 'bg-orange-400' },
  blocked:         { bg: 'bg-red-50',    text: 'text-red-600',   dot: 'bg-red-400' },
  failed:          { bg: 'bg-red-100',   text: 'text-red-700',   dot: 'bg-red-500' },
  completed:       { bg: 'bg-green-50',  text: 'text-green-700', dot: 'bg-green-500' },
  cancelled:       { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300' },
}

/** Priority colour mapping */
export const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-50',    text: 'text-red-700' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-700' },
  medium:   { bg: 'bg-amber-50',  text: 'text-amber-700' },
  low:      { bg: 'bg-slate-100', text: 'text-slate-600' },
}

/** cn — simple className joiner */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
