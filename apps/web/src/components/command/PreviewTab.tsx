'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRelative } from '@/lib/utils'
import {
  Globe, ExternalLink, RefreshCw, Copy, Check, AlertCircle,
  Loader2, Settings, Monitor, Smartphone,
} from 'lucide-react'

interface Props {
  projectId: string
}

// ── URL input modal for setting preview URL ────────────────────────────────────
function SetUrlBanner({ onSet }: { onSet: (url: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
      setError('')
      onSet(url.href)
    } catch {
      setError('Please enter a valid URL')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5 shadow-sm">
        <Globe className="h-8 w-8 text-slate-300" />
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1">No preview configured</h3>
      <p className="text-sm text-slate-400 max-w-xs mb-6">
        Enter your deployment URL to preview the live app directly inside Build OS.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-2 w-full max-w-sm">
        <div className="flex w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
          <span className="flex items-center px-3 text-slate-400 text-xs font-mono border-r border-slate-200 bg-slate-50 select-none shrink-0">
            https://
          </span>
          <input
            type="text"
            value={value}
            onChange={e => { setValue(e.target.value); setError('') }}
            placeholder="your-app.vercel.app"
            className="flex-1 px-3 py-2.5 text-sm text-slate-700 outline-none bg-white placeholder:text-slate-300 font-mono"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2.5 transition-colors shadow-sm"
        >
          Set preview URL
        </button>
      </form>
      <div className="mt-5 flex items-center gap-1.5 text-xs text-slate-400">
        <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
        URL is saved in project settings
      </div>
    </div>
  )
}

// ── Viewport size toggle ─────────────────────────────────────────────────────
type ViewportSize = 'desktop' | 'mobile'
const VIEWPORT_CONFIG: Record<ViewportSize, { width: string; label: string }> = {
  desktop: { width: '100%',   label: 'Desktop' },
  mobile:  { width: '390px',  label: 'Mobile (390px)' },
}

export default function PreviewTab({ projectId }: Props) {
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)
  const [frameLoading, setFrameLoading]   = useState(false)
  const [frameKey, setFrameKey]           = useState(0)
  const [copied, setCopied]               = useState(false)
  const [viewport, setViewport]           = useState<ViewportSize>('desktop')
  const [lastRefresh, setLastRefresh]     = useState<Date | null>(null)
  const [artifactCount, setArtifactCount] = useState(0)
  const prevArtifactCount = useRef(0)
  const supabase = createClient()

  // Save preview URL to project_settings
  const savePreviewUrl = useCallback(async (url: string) => {
    setPreviewUrl(url)
    setFrameLoading(true)
    await supabase
      .from('project_settings')
      .upsert({ project_id: projectId, preview_url: url } as any, { onConflict: 'project_id' })
  }, [projectId])

  // Load preview URL from DB
  // P5: Auto-load preview URL
  //   Priority 1: project_settings.preview_url (manually saved)
  //   Priority 2: project_environments.deployment_url (production env, set by deploy agent)
  const loadPreviewUrl = useCallback(async () => {
    const { data: settings } = await supabase
      .from('project_settings')
      .select('preview_url')
      .eq('project_id', projectId)
      .single() as any
    const savedUrl = (settings as any)?.preview_url

    const { data: env } = await supabase
      .from('project_environments')
      .select('deployment_url')
      .eq('project_id', projectId)
      .eq('name', 'production')
      .single() as any
    const envUrl = (env as any)?.deployment_url

    const resolvedUrl = savedUrl || envUrl || null
    setPreviewUrl(resolvedUrl)

    // Auto-persist env URL to settings if no manual URL was set yet
    if (!savedUrl && envUrl) {
      await supabase
        .from('project_settings')
        .upsert({ project_id: projectId, preview_url: envUrl } as any, { onConflict: 'project_id' })
    }

    setLoading(false)
  }, [projectId, supabase])

  // Watch for new frontend artifacts → auto-refresh iframe
  const watchArtifacts = useCallback(async () => {
    const { data } = await supabase
      .from('agent_outputs')
      .select('id')
      .eq('project_id', projectId)
      .eq('output_type', 'code')
      .order('created_at', { ascending: false })
      .limit(50) as any
    const count = (data as any[])?.length || 0
    if (count > prevArtifactCount.current && prevArtifactCount.current > 0) {
      setFrameKey(k => k + 1)
      setLastRefresh(new Date())
    }
    prevArtifactCount.current = count
    setArtifactCount(count)
  }, [projectId])

  useEffect(() => {
    loadPreviewUrl()
    watchArtifacts()
    const interval = setInterval(watchArtifacts, 30_000)
    return () => clearInterval(interval)
  }, [loadPreviewUrl, watchArtifacts])

  function handleManualRefresh() {
    setFrameKey(k => k + 1)
    setLastRefresh(new Date())
    setFrameLoading(true)
  }

  async function handleCopyUrl() {
    if (!previewUrl) return
    await navigator.clipboard.writeText(previewUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClearUrl() {
    setPreviewUrl(null)
    supabase
      .from('project_settings')
      .upsert({ project_id: projectId, preview_url: null } as any, { onConflict: 'project_id' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
      </div>
    )
  }

  if (!previewUrl) {
    return <SetUrlBanner onSet={savePreviewUrl} />
  }

  const vpConfig = VIEWPORT_CONFIG[viewport]

  return (
    <div className="flex flex-col space-y-3">
      {/* Browser chrome toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleClearUrl}
            className="h-3 w-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors"
            title="Clear preview URL"
          />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
        </div>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 font-mono min-w-0">
          <Globe className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="truncate">{previewUrl}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopyUrl}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all"
            title="Copy URL"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleManualRefresh}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all"
            title="Refresh preview"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${frameLoading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all"
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          {/* Viewport toggle */}
          <button
            onClick={() => setViewport(v => v === 'desktop' ? 'mobile' : 'desktop')}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
              viewport === 'mobile'
                ? 'bg-brand-50 text-brand-600 border border-brand-200'
                : 'text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm'
            }`}
            title={`Switch to ${viewport === 'desktop' ? 'mobile' : 'desktop'} view`}
          >
            {viewport === 'desktop' ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          Live · {artifactCount} code artifacts
        </span>
        {lastRefresh && (
          <span>Last refresh: {formatRelative(lastRefresh.toISOString())}</span>
        )}
      </div>

      {/* iframe container */}
      <div
        className={`mx-auto rounded-xl border border-slate-200 overflow-hidden bg-white shadow-md transition-all duration-300 ${
          viewport === 'mobile' ? 'shadow-2xl' : ''
        }`}
        style={{ width: vpConfig.width, minHeight: 560 }}
      >
        {/* Loading overlay */}
        {frameLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
              <p className="text-xs text-slate-400">Loading preview…</p>
            </div>
          </div>
        )}
        <iframe
          key={frameKey}
          src={previewUrl}
          className="w-full"
          style={{ height: 560, display: frameLoading ? 'none' : 'block' }}
          title="App Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          onLoad={() => {
            setFrameLoading(false)
            setLastRefresh(new Date())
          }}
        />
      </div>

      {/* Mobile label */}
      {viewport === 'mobile' && (
        <p className="text-center text-xs text-slate-400">Mobile preview (390px)</p>
      )}
    </div>
  )
}
