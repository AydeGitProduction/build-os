import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'
import { getOrchestrationStatus } from '@/lib/orchestration'
import Button from '@/components/ui/Button'
import { ROADMAP_SUMMARY } from '@/data/build-os-roadmap'
import { Zap } from 'lucide-react'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single()
  return { title: `Orchestrate · ${data?.name || 'Project'}` }
}

export default async function OrchestratePage({ params }: Props) {
  const supabase  = await createServerSupabaseClient()
  const admin     = createAdminSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', params.id)
    .single()

  if (!project) notFound()
  if (project.status === 'draft') redirect(`/projects/${params.id}/onboarding`)

  // Check if roadmap has been seeded
  const { data: epicCheck } = await admin
    .from('epics')
    .select('id')
    .eq('project_id', params.id)
    .limit(1)

  const hasRoadmap = !!(epicCheck && epicCheck.length > 0)

  // Fetch orchestration status
  const status = await getOrchestrationStatus(admin, params.id)

  return (
    <>
      <TopBar title="Orchestration" subtitle={project.name} />
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* ── Seed CTA — only shown if roadmap not yet seeded ── */}
          {!hasRoadmap && (
            <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-500 mx-auto mb-4">
                <Zap className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">
                Activate Self-Build Mode
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto mb-1">
                Seed the Build OS self-referential roadmap — {ROADMAP_SUMMARY.epics} epics,
                {' '}{ROADMAP_SUMMARY.features} features, {ROADMAP_SUMMARY.tasks} tasks — then activate
                the autonomous loop to start building without human prompts.
              </p>
              <p className="text-xs text-slate-400 mb-6">
                Estimated execution cost: ~${ROADMAP_SUMMARY.total_estimated_cost_usd.toFixed(2)} USD
              </p>
              <form action={`/api/projects/${params.id}/seed-self-roadmap`} method="POST">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
                >
                  <Zap className="h-4 w-4" />
                  Seed Roadmap &amp; Activate
                </button>
              </form>
              <p className="text-[10px] text-slate-400 mt-3">
                This seeds {ROADMAP_SUMMARY.tasks} tasks across {ROADMAP_SUMMARY.features} features.
                Idempotent — safe to re-run.
              </p>
            </div>
          )}

          {/* ── Orchestration panel ── */}
          <OrchestrationPanel
            projectId={params.id}
            initialStatus={status}
          />

          {/* ── Human role description ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Human Role After Activation</h3>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="space-y-2">
                <p className="font-semibold text-green-700 uppercase tracking-wide text-[10px]">You do</p>
                <ul className="space-y-1 text-slate-600">
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />Review QA verdicts</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />Approve releases</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />Override decisions</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />Resolve blockers</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-red-700 uppercase tracking-wide text-[10px]">System does</p>
                <ul className="space-y-1 text-slate-600">
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />Detect ready tasks</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />Dispatch to agents</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />Unlock dependencies</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />Track costs</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />Generate docs</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />Auto-retry failures</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-amber-700 uppercase tracking-wide text-[10px]">Guardrails</p>
                <ul className="space-y-1 text-slate-600">
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />Budget ceiling</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />Max concurrency</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />Max retries (3)</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />Safe-stop switch</li>
                  <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />DLQ for failures</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
