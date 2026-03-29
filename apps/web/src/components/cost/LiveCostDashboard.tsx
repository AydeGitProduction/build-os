'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card, { CardHeader, CardTitle } from '@/components/ui/Card'
import ProgressBar from '@/components/ui/ProgressBar'
import { formatUSD, formatRelative, percentage } from '@/lib/utils'
import { DollarSign, TrendingUp, Zap, RefreshCw, BarChart3 } from 'lucide-react'

interface CostEvent {
  id: string
  event_type: string
  category: string
  description: string
  tokens_used: number | null
  model_id: string | null
  unit_cost_usd: number
  quantity: number
  total_cost_usd: number
  task_id: string | null
  created_at: string
}

interface CostModel {
  total_spend_usd: number
  ai_usage_usd: number
  automation_usd: number
  infrastructure_usd: number
  saas_usd: number
  storage_usd: number
  budget_usd: number | null
  last_calculated_at: string
}

interface LiveCostDashboardProps {
  projectId: string
  initialCostModel: CostModel | null
  initialEvents: CostEvent[]
  estimatedTotal: number
}

const CATEGORY_COLORS: Record<string, string> = {
  ai:             'bg-brand-500',
  automation:     'bg-indigo-500',
  infrastructure: 'bg-slate-500',
  saas:           'bg-amber-500',
  storage:        'bg-emerald-500',
  other:          'bg-slate-400',
}

const CATEGORY_LABELS: Record<string, string> = {
  ai:             'AI / LLM',
  automation:     'Automation',
  infrastructure: 'Infrastructure',
  saas:           'SaaS',
  storage:        'Storage',
  other:          'Other',
}

export default function LiveCostDashboard({
  projectId,
  initialCostModel,
  initialEvents,
  estimatedTotal,
}: LiveCostDashboardProps) {
  const supabase = createClient()
  const [costModel, setCostModel]   = useState<CostModel | null>(initialCostModel)
  const [events, setEvents]         = useState<CostEvent[]>(initialEvents)
  const [isLive, setIsLive]         = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // ── Realtime subscription on cost_events + cost_models ────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`buildos:cost:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cost_events',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newEvent = payload.new as CostEvent
          setEvents(prev => [newEvent, ...prev].slice(0, 100))
          setLastRefresh(new Date())
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cost_models',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setCostModel(payload.new as CostModel)
          setLastRefresh(new Date())
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    return () => { supabase.removeChannel(channel) }
  }, [projectId])

  const totalSpend = costModel?.total_spend_usd || 0
  const budget     = costModel?.budget_usd || 0
  const budgetUsed = budget > 0 ? percentage(totalSpend, budget) : 0

  // Category breakdown from events
  const byCategory = events.reduce((acc: Record<string, number>, e) => {
    acc[e.category] = (acc[e.category] || 0) + (e.total_cost_usd || 0)
    return acc
  }, {})

  // Compute burn rate (cost per day from first event)
  const burnRate = (() => {
    if (events.length < 2) return null
    const oldest = new Date(events[events.length - 1].created_at)
    const newest = new Date(events[0].created_at)
    const days = Math.max((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24), 1)
    return totalSpend / days
  })()

  return (
    <div className="space-y-6">
      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className="text-xs text-slate-500">
            {isLive ? 'Live tracking' : 'Connecting…'} · Updated {formatRelative(lastRefresh.toISOString())}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total spend',    value: formatUSD(totalSpend),         icon: DollarSign, color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: 'AI / LLM',       value: formatUSD(costModel?.ai_usage_usd || 0), icon: Zap, color: 'text-brand-600', bg: 'bg-brand-50' },
          { label: 'Burn rate/day',  value: burnRate ? formatUSD(burnRate) : '—',    icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Estimated total', value: formatUSD(estimatedTotal),    icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(stat => (
          <Card key={stat.label} padding="md">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{stat.label}</p>
                <p className="text-base font-semibold text-slate-900">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Budget utilisation */}
      {budget > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Budget utilisation</CardTitle>
            <span className="text-sm font-semibold text-slate-700">{budgetUsed}%</span>
          </CardHeader>
          <ProgressBar
            value={budgetUsed}
            size="lg"
            color={budgetUsed >= 90 ? 'red' : budgetUsed >= 70 ? 'amber' : 'green'}
            showLabel
            label={`${formatUSD(totalSpend)} of ${formatUSD(budget)}`}
          />
        </Card>
      )}

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Spend by category</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amount]) => {
                const pct = totalSpend > 0 ? percentage(amount, totalSpend) : 0
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{pct}%</span>
                        <span className="text-xs font-semibold text-slate-800">{formatUSD(amount, 4)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${CATEGORY_COLORS[cat] || 'bg-slate-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        </Card>
      )}

      {/* Live cost event feed */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 text-slate-400 ${isLive ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            Cost event ledger
          </h3>
          <span className="text-xs text-slate-400">{events.length} events</span>
        </div>

        {events.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            No cost events yet. Events appear here as agents execute tasks.
          </div>
        ) : (
          <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
            {events.map(event => (
              <div key={event.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className={`h-2 w-2 rounded-full shrink-0 ${CATEGORY_COLORS[event.category] || 'bg-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{event.description}</p>
                  <p className="text-[10px] text-slate-400">
                    {event.model_id && <span className="mr-2">{event.model_id}</span>}
                    {event.tokens_used && <span>{event.tokens_used.toLocaleString()} tokens</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-slate-800">{formatUSD(event.total_cost_usd, 5)}</p>
                  <p className="text-[10px] text-slate-400">{formatRelative(event.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
