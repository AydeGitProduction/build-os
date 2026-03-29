'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRelative } from '@/lib/utils'
import {
  Database, Plug, Code2, Cpu, CheckCircle, Clock, AlertCircle,
  Server, Globe, Lock, Layers,
} from 'lucide-react'
import Card from '@/components/ui/Card'

// ── Types ──────────────────────────────────────────────────────────────────────
interface SchemaEntry {
  id: string
  version: string
  description: string
  status: string
  applied_at?: string
  created_at: string
}

interface Integration {
  id: string
  provider: { name: string; display_name: string; category: string }
  status: string
  created_at: string
}

interface ApiContract {
  id: string
  service_name: string
  version: string
  status: string
  spec_format: string
  created_at: string
}

interface Props {
  projectId: string
}

// ── Status badge ───────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  applied:     'text-emerald-700 bg-emerald-50 border-emerald-200',
  active:      'text-emerald-700 bg-emerald-50 border-emerald-200',
  connected:   'text-emerald-700 bg-emerald-50 border-emerald-200',
  pending:     'text-amber-700  bg-amber-50  border-amber-200',
  configured:  'text-blue-700   bg-blue-50   border-blue-200',
  draft:       'text-slate-600  bg-slate-100 border-slate-200',
  deprecated:  'text-red-700    bg-red-50    border-red-200',
  failed:      'text-red-700    bg-red-50    border-red-200',
  error:       'text-red-700    bg-red-50    border-red-200',
  rolled_back: 'text-slate-600  bg-slate-100 border-slate-200',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[status] || 'text-slate-600 bg-slate-100 border-slate-200'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Tech stack ─────────────────────────────────────────────────────────────────
const TECH_STACK = [
  { label: 'Framework',   value: 'Next.js 14',          icon: '▲', section: 'Infrastructure' },
  { label: 'Database',    value: 'Supabase · Postgres',  icon: '🐘', section: 'Database' },
  { label: 'Auth',        value: 'Supabase Auth',        icon: '🔐', section: 'Infrastructure' },
  { label: 'Styling',     value: 'Tailwind CSS',         icon: '🎨', section: 'Infrastructure' },
  { label: 'AI Engine',   value: 'Anthropic Claude',     icon: '🤖', section: 'APIs' },
  { label: 'Deployment',  value: 'Vercel Edge',          icon: '▲', section: 'Infrastructure' },
  { label: 'Language',    value: 'TypeScript',           icon: '📘', section: 'Infrastructure' },
  { label: 'Runtime',     value: 'Edge · Node.js',       icon: '⚡', section: 'Infrastructure' },
]

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, count, countLabel }: {
  icon: React.ElementType
  title: string
  count?: number
  countLabel?: string
}) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      {count !== undefined && (
        <span className="text-xs text-slate-400">{count} {countLabel}</span>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SystemSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Tech stack skeleton */}
      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="h-3.5 bg-slate-100 rounded w-24" />
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="h-3.5 bg-slate-100 rounded w-32" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-5 py-3">
                <div className="h-4 w-4 rounded-full bg-slate-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/3" />
                </div>
                <div className="h-5 w-14 rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SystemView({ projectId }: Props) {
  const [schemas, setSchemas]           = useState<SchemaEntry[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [apis, setApis]                 = useState<ApiContract[]>([])
  const [loading, setLoading]           = useState(true)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const [schemaRes, intRes, apiRes] = await Promise.all([
      supabase
        .from('schema_registry')
        .select('id, version, description, status, applied_at, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20) as any,
      supabase
        .from('project_integrations')
        .select('id, status, created_at, provider:integration_providers(name, display_name, category)')
        .eq('project_id', projectId)
        .limit(20) as any,
      supabase
        .from('api_contracts')
        .select('id, service_name, version, status, spec_format, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20) as any,
    ])

    setSchemas((schemaRes.data as any) || [])
    setIntegrations((intRes.data as any) || [])
    setApis((apiRes.data as any) || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) return <SystemSkeleton />

  return (
    <div className="space-y-5">

      {/* ── Infrastructure · Tech Stack ────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <SectionHeader icon={Server} title="Infrastructure · Tech Stack" />
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TECH_STACK.map(item => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 hover:border-slate-200 transition-colors"
            >
              <span className="text-base leading-none">{item.icon}</span>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 font-medium">{item.label}</p>
                <p className="text-xs font-semibold text-slate-700 truncate">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Database · Schema Registry ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <SectionHeader
          icon={Database}
          title="Database · Schema Registry"
          count={schemas.length}
          countLabel="migrations"
        />
        {schemas.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">No schema migrations yet</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {schemas.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="shrink-0">
                  {s.status === 'applied' ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : s.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-semibold text-slate-700">{s.version}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  {s.description && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{s.description}</p>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {formatRelative(s.applied_at || s.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Integrations ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <SectionHeader
          icon={Plug}
          title="Integrations · External Services"
          count={integrations.length}
          countLabel="configured"
        />
        {integrations.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">No integrations configured yet</p>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {integrations.map(int => {
              const displayName = (int.provider as any)?.display_name || 'Unknown'
              const category    = (int.provider as any)?.category    || ''
              return (
                <div
                  key={int.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 hover:border-slate-200 hover:bg-white transition-all"
                >
                  {/* Logo placeholder */}
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm border border-slate-200 text-sm font-bold text-slate-700 uppercase shrink-0">
                    {displayName.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{displayName}</p>
                    {category && <p className="text-[10px] text-slate-400 capitalize">{category}</p>}
                  </div>
                  <StatusBadge status={int.status} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── APIs · Contracts ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <SectionHeader
          icon={Code2}
          title="APIs · Service Contracts"
          count={apis.length}
          countLabel="defined"
        />
        {apis.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">No API contracts defined yet</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {apis.map(api => (
              <div key={api.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                {/* Format badge */}
                <div className="shrink-0">
                  <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600">
                    {api.spec_format?.replace(/_/g, ' ').toUpperCase() || 'API'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">{api.service_name}</span>
                    <span className="text-[10px] font-mono text-slate-400">v{api.version}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={api.status} />
                  <span className="text-xs text-slate-400">{formatRelative(api.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
