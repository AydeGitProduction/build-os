'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import Card, { CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input, { Textarea, Select } from '@/components/ui/Input'
import { ArrowLeft, Zap } from 'lucide-react'

const PROJECT_TYPES = [
  { value: 'saas',          label: 'SaaS Product — Subscription-based web application' },
  { value: 'ai_newsletter', label: 'AI Newsletter Platform — Email campaigns & subscriber management' },
  { value: 'ai_app',        label: 'AI Application — LLM-powered intelligent system' },
  { value: 'marketplace',   label: 'Marketplace — Two-sided platform connecting buyers and sellers' },
  { value: 'crm',           label: 'CRM — Customer relationship management tool' },
  { value: 'tool',          label: 'Productivity Tool — Developer/team productivity software' },
  { value: 'api',           label: 'API Product — Developer-facing API or SDK' },
  { value: 'other',         label: 'Other — Custom project type' },
]

interface Workspace {
  id: string
  name: string
  slug: string
}

export default function NewProjectPage() {
  const router = useRouter()

  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState('saas')
  const [workspaceId, setWorkspaceId] = useState('')
  const [targetDate, setTargetDate]   = useState('')

  const [workspaces, setWorkspaces]   = useState<Workspace[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.json())
      .then(({ data }) => {
        setWorkspaces(data || [])
        if (data?.length > 0) setWorkspaceId(data[0].id)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Project name is required'); return }
    if (!workspaceId) { setError('Please select a workspace'); return }

    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          workspace_id: workspaceId,
          project_type: projectType,
          target_date: targetDate || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to create project')
        return
      }

      // Redirect to onboarding wizard
      router.push(`/projects/${json.data.id}/onboarding`)
    } catch {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TopBar
        title="New project"
        subtitle="Set up your project details"
        actions={
          <Link href="/projects">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
              Back
            </Button>
          </Link>
        }
      />

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-2xl">
          {/* Info banner */}
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <Zap className="h-5 w-5 text-brand-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-brand-800">Blueprint generation included</p>
              <p className="text-xs text-brand-600 mt-0.5">
                After creating your project you&apos;ll complete a short onboarding wizard. Build OS will
                instantly generate your full architecture blueprint and execution plan.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Project details</CardTitle>
            </CardHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Project name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Awesome SaaS"
                required
              />

              <Textarea
                label="Description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of what you're building…"
                hint="Optional — you can elaborate during onboarding"
              />

              <Select
                label="Project type"
                value={projectType}
                onChange={e => setProjectType(e.target.value)}
                options={PROJECT_TYPES}
                required
              />

              {workspaces.length > 0 && (
                <Select
                  label="Workspace"
                  value={workspaceId}
                  onChange={e => setWorkspaceId(e.target.value)}
                  options={workspaces.map(w => ({ value: w.id, label: w.name }))}
                  required
                />
              )}

              <Input
                label="Target delivery date"
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                hint="Optional — used to assess timeline risk"
              />

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <Link href="/projects">
                  <Button variant="ghost" type="button">Cancel</Button>
                </Link>
                <Button type="submit" loading={loading} rightIcon={<Zap className="h-3.5 w-3.5" />}>
                  Create & start onboarding
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  )
}
