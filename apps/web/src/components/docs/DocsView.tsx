'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { BookOpen, FileText, GitBranch, TestTube, Shield, Database, Code2, Zap, FileQuestion, Cpu, DollarSign, Clipboard, Check, RefreshCw, Plus, ChevronRight, Search } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Document {
  id: string
  doc_type: string
  title: string
  status: string
  version: number
  content: string | null
  owner_agent_role: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface DocsViewProps {
  projectId: string
  initialDocs: Document[]
}

// ── Config ─────────────────────────────────────────────────────────────────────
const DOC_TYPE_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  prd:          { label: 'PRD',          Icon: FileText,     color: 'text-violet-500 bg-violet-50' },
  architecture: { label: 'Architecture', Icon: GitBranch,    color: 'text-blue-500 bg-blue-50'    },
  adr:          { label: 'ADR',          Icon: Clipboard,    color: 'text-amber-500 bg-amber-50'  },
  data_model:   { label: 'Data Model',   Icon: Database,     color: 'text-green-500 bg-green-50'  },
  api_contract: { label: 'API Contract', Icon: Code2,        color: 'text-rose-500 bg-rose-50'    },
  automation:   { label: 'Automation',   Icon: Zap,          color: 'text-orange-500 bg-orange-50'},
  cost_model:   { label: 'Cost Model',   Icon: DollarSign,   color: 'text-teal-500 bg-teal-50'   },
  qa_report:    { label: 'QA Report',    Icon: TestTube,     color: 'text-pink-500 bg-pink-50'    },
  runbook:      { label: 'Runbook',      Icon: Cpu,          color: 'text-slate-500 bg-slate-100' },
  other:        { label: 'Other',        Icon: FileQuestion, color: 'text-slate-400 bg-slate-50'  },
}

const STATUS_COLORS: Record<string, string> = {
  draft:      'bg-amber-100 text-amber-700',
  approved:   'bg-green-100 text-green-700',
  superseded: 'bg-slate-100 text-slate-500',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function groupByType(docs: Document[]): Record<string, Document[]> {
  const grouped: Record<string, Document[]> = {}
  for (const doc of docs) {
    if (!grouped[doc.doc_type]) grouped[doc.doc_type] = []
    grouped[doc.doc_type].push(doc)
  }
  return grouped
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DocsView({ projectId, initialDocs }: DocsViewProps) {
  const [docs, setDocs]         = useState<Document[]>(initialDocs)
  const [selected, setSelected] = useState<Document | null>(initialDocs[0] ?? null)
  const [search, setSearch]     = useState('')
  const [copied, setCopied]     = useState(false)

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const channel = supabase
      .channel(`docs:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newDoc = payload.new as Document
            setDocs(prev => [newDoc, ...prev])
            // Auto-select if nothing selected
            setSelected(prev => prev ?? newDoc)
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Document
            setDocs(prev => prev.map(d => d.id === updated.id ? updated : d))
            setSelected(prev => prev?.id === updated.id ? updated : prev)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId])

  // ── Copy content ───────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!selected?.content) return
    await navigator.clipboard.writeText(selected.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [selected])

  // ── Filtered + grouped docs ────────────────────────────────────────────────
  const filtered = docs.filter(d =>
    search === '' ||
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.doc_type.toLowerCase().includes(search.toLowerCase())
  )
  const grouped = groupByType(filtered)

  // ── Empty state ────────────────────────────────────────────────────────────
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 mb-4">
          <BookOpen className="h-7 w-7 text-slate-400" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 mb-2">No documentation yet</h3>
        <p className="text-xs text-slate-500 max-w-xs">
          Documentation is auto-generated by the Documentation Engineer agent as tasks are completed.
          Trigger a task execution to see documents appear here live.
        </p>
        <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="flex h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Listening for new documents…
        </div>
      </div>
    )
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-0 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">

      {/* ── Left sidebar ── */}
      <div className="w-64 shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/60">
        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search docs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto py-2">
          {Object.entries(grouped).map(([type, typeDocs]) => {
            const meta = DOC_TYPE_META[type] || DOC_TYPE_META.other
            const Icon = meta.Icon
            return (
              <div key={type} className="mb-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Icon className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {meta.label}
                  </span>
                </div>
                {typeDocs.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => setSelected(doc)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-white transition-colors rounded-lg mx-1 ${
                      selected?.id === doc.id ? 'bg-white shadow-sm border border-slate-200' : ''
                    }`}
                  >
                    <ChevronRight className={`h-3 w-3 mt-0.5 shrink-0 transition-transform ${selected?.id === doc.id ? 'text-brand-500 rotate-90' : 'text-slate-300'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate leading-tight">{doc.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">v{doc.version} · <span className="capitalize">{doc.status}</span></p>
                    </div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="flex h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            {docs.length} document{docs.length !== 1 ? 's' : ''} · live
          </div>
        </div>
      </div>

      {/* ── Right content panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            {/* Doc header */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const meta = DOC_TYPE_META[selected.doc_type] || DOC_TYPE_META.other
                    const Icon = meta.Icon
                    return (
                      <span className={`flex h-6 w-6 items-center justify-center rounded ${meta.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                    )
                  })()}
                  <h2 className="text-base font-semibold text-slate-900 truncate">{selected.title}</h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[selected.status] || 'bg-slate-100 text-slate-600'}`}>
                    {selected.status}
                  </span>
                  <span className="text-[10px] text-slate-400">v{selected.version}</span>
                  {selected.owner_agent_role && (
                    <span className="text-[10px] text-slate-400 capitalize">· {selected.owner_agent_role.replace(/_/g, ' ')}</span>
                  )}
                  <span className="text-[10px] text-slate-400">· Updated {formatDate(selected.updated_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={copied ? <Check className="h-3 w-3 text-green-500" /> : <Clipboard className="h-3 w-3" />}
                  onClick={handleCopy}
                  className={copied ? 'text-green-600' : ''}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Doc content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {selected.content ? (
                <MarkdownRenderer content={selected.content} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <RefreshCw className="h-6 w-6 text-slate-300 mb-3 animate-spin" />
                  <p className="text-sm text-slate-400">Content is being generated…</p>
                  <p className="text-xs text-slate-300 mt-1">This document will update automatically when the agent finishes.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BookOpen className="h-8 w-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Select a document to read</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
