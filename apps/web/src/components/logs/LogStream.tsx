'use client'
/**
 * LogStream — real-time bottom drawer log viewer
 * - Collapsible drawer (tab ↔ expanded)
 * - Level filter: ALL / INFO / WARN / ERROR
 * - Source filter (agent role or system)
 * - Auto-scroll to bottom, pause on scroll-up
 * - Keyboard: L to toggle
 *
 * WS8 — Log Stream
 */

import {
  useState, useEffect, useRef, useCallback,
} from 'react'
import { useLogStream, type LogLevel, type LogEntry } from '@/hooks/useLogStream'
import { Terminal, X, ChevronUp, ChevronDown, Wifi, WifiOff, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Level Badge ──────────────────────────────────────────────────────────────

const LEVEL_STYLE: Record<LogLevel, string> = {
  info:  'text-blue-400',
  warn:  'text-amber-400',
  error: 'text-red-400',
  debug: 'text-slate-500',
}

function LevelBadge({ level }: { level: LogLevel }) {
  return (
    <span className={cn('text-2xs font-mono uppercase font-bold w-10 flex-shrink-0', LEVEL_STYLE[level])}>
      {level}
    </span>
  )
}

// ─── Single Log Entry Row ─────────────────────────────────────────────────────

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const ts = new Date(entry.timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div
      className={cn(
        'flex gap-2 px-3 py-0.5 text-xs font-mono hover:bg-slate-800/50 cursor-pointer',
        entry.level === 'error' && 'border-l-2 border-red-600 pl-2',
        entry.level === 'warn'  && 'border-l-2 border-amber-600 pl-2',
      )}
      onClick={() => setExpanded(e => !e)}
    >
      <span className="text-slate-600 flex-shrink-0">{ts}</span>
      <LevelBadge level={entry.level} />
      <span className="text-slate-500 flex-shrink-0 w-24 truncate capitalize">
        {entry.source.replace(/_engineer|_analyst|_manager/, '')}
      </span>
      <span className={cn('flex-1 text-slate-300 break-all', expanded ? 'whitespace-pre-wrap' : 'truncate')}>
        {entry.message}
      </span>
    </div>
  )
}

// ─── Log Toolbar ──────────────────────────────────────────────────────────────

const ALL_LEVELS: LogLevel[] = ['info', 'warn', 'error', 'debug']

interface ToolbarProps {
  levelFilter:  LogLevel[]
  sourceFilter: string
  sources:      string[]
  onLevel:      (levels: LogLevel[]) => void
  onSource:     (s: string) => void
  onClear:      () => void
}

function LogToolbar({ levelFilter, sourceFilter, sources, onLevel, onSource, onClear }: ToolbarProps) {
  const toggleLevel = (l: LogLevel) => {
    if (levelFilter.includes(l)) onLevel(levelFilter.filter(x => x !== l))
    else onLevel([...levelFilter, l])
  }
  const allSelected = levelFilter.length === 0

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-950 flex-shrink-0">
      {/* Level pills */}
      <button
        onClick={() => onLevel([])}
        className={cn('px-2 py-0.5 rounded text-2xs font-medium transition-colors',
          allSelected ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300')}
      >
        ALL
      </button>
      {ALL_LEVELS.map(l => (
        <button
          key={l}
          onClick={() => toggleLevel(l)}
          className={cn('px-2 py-0.5 rounded text-2xs font-medium uppercase transition-colors',
            levelFilter.includes(l) ? cn(LEVEL_STYLE[l], 'bg-slate-800') : 'text-slate-600 hover:text-slate-400')}
        >
          {l}
        </button>
      ))}

      <span className="h-4 w-px bg-slate-800" />

      {/* Source filter */}
      <select
        value={sourceFilter}
        onChange={e => onSource(e.target.value)}
        className="bg-slate-900 border border-slate-700 text-slate-400 text-2xs rounded px-1.5 py-0.5 outline-none"
      >
        <option value="all">All sources</option>
        {sources.map(s => (
          <option key={s} value={s}>{s.replace(/_engineer|_analyst|_manager/, '')}</option>
        ))}
      </select>

      <span className="flex-1" />

      <button
        onClick={onClear}
        className="flex items-center gap-1 text-2xs text-slate-600 hover:text-slate-400 transition-colors"
        title="Clear logs"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─── Main LogStream ───────────────────────────────────────────────────────────

interface LogStreamProps {
  projectId:   string
  defaultOpen?: boolean
}

const COLLAPSED_H = 32
const DEFAULT_H   = 220
const MAX_H       = 600

export default function LogStream({ projectId, defaultOpen = false }: LogStreamProps) {
  const [open, setOpen]           = useState(defaultOpen)
  const [height, setHeight]       = useState(DEFAULT_H)
  const [levelFilter, setLevel]   = useState<LogLevel[]>([])
  const [sourceFilter, setSource] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef   = useRef<HTMLDivElement>(null)
  const dragRef   = useRef<{ startY: number; startH: number } | null>(null)

  const { entries, loading, connected, clear, sources } = useLogStream({
    projectId,
    enabled:      open,
    levelFilter:  levelFilter.length > 0 ? levelFilter : undefined,
    sourceFilter: sourceFilter !== 'all' ? sourceFilter : undefined,
  })

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  // Keyboard shortcut L
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'l' || e.key === 'L') setOpen(o => !o)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Drag resize
  const startDrag = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: height }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      setHeight(Math.max(DEFAULT_H, Math.min(MAX_H, dragRef.current.startH + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [height])

  const handleScroll = useCallback(() => {
    if (!listRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    setAutoScroll(scrollTop + clientHeight >= scrollHeight - 10)
  }, [])

  return (
    <div
      className="w-full bg-slate-950 border-t border-slate-800 flex flex-col flex-shrink-0 transition-all duration-150"
      style={{ height: open ? height : COLLAPSED_H }}
    >
      {/* Drag handle */}
      {open && (
        <div
          onMouseDown={startDrag}
          className="h-1.5 w-full cursor-row-resize hover:bg-slate-700 transition-colors flex-shrink-0"
        />
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-2 px-3 h-8 flex-shrink-0 border-b border-slate-800">
        <Terminal className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs text-slate-400 font-medium">Logs</span>
        {entries.length > 0 && (
          <span className="text-2xs bg-slate-800 text-slate-400 px-1.5 rounded-full font-mono">
            {entries.length}
          </span>
        )}
        <span className="flex-1" />
        {/* Connected dot */}
        <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-red-500')} title={connected ? 'Connected' : 'Disconnected'} />
        <button
          onClick={() => setOpen(o => !o)}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-slate-300"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Content */}
      {open && (
        <>
          <LogToolbar
            levelFilter={levelFilter}
            sourceFilter={sourceFilter}
            sources={sources}
            onLevel={setLevel}
            onSource={setSource}
            onClear={clear}
          />
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto py-1"
          >
            {loading && entries.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                <span className="animate-pulse">Connecting to log stream…</span>
              </div>
            )}
            {!loading && entries.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600">
                No log entries yet.
              </div>
            )}
            {entries.map(e => <LogRow key={e.id} entry={e} />)}
          </div>
          {/* Auto-scroll resume hint */}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true)
                if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
              }}
              className="text-2xs text-brand-400 hover:text-brand-300 py-1 text-center w-full border-t border-slate-800 bg-slate-950/80"
            >
              ↓ Resume auto-scroll
            </button>
          )}
        </>
      )}
    </div>
  )
}
