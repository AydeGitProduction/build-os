'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { IrisStatusBar } from './IrisStatusBar'
import { IrisChat } from './IrisChat'
import { IrisPreviewPanel } from './IrisPreviewPanel'
import { IrisMobileTabs } from './IrisMobileTabs'

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface IrisMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface IrisAssumption {
  id: string
  label: string
  value: string
  status: 'pending' | 'accepted' | 'rejected' | 'modified'
}

export interface IrisPreviewData {
  title: string
  description: string
  phases: Array<{ label: string; duration: string }>
  assumptions: IrisAssumption[]
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface ConvMessage {
  role: 'user' | 'assistant'
  content: string
}

interface BlueprintFeature {
  id: string
  title: string
  description: string
  priority: string
  order_index: number
}

interface StackRec {
  id: string
  layer: string
  tool: string
  reasoning: string
  order_index: number
}

interface Blueprint {
  id: string
  project_id: string
  summary: string
  goals: string[]
  status: string
  blueprint_features: BlueprintFeature[]
  blueprint_stack_recommendations: StackRec[]
}

interface IrisWorkspaceProps {
  userId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WELCOME: IrisMessage = {
  id: '0',
  role: 'assistant',
  content:
    "Hi! I'm IRIS, your AI project architect. Tell me what you want to build and I'll design the perfect execution plan for you.",
  timestamp: new Date(),
}

function blueprintToPreview(
  bp: Blueprint,
  statuses: Record<string, IrisAssumption['status']>
): IrisPreviewData {
  const layerMap: Record<string, string[]> = {}
  for (const r of bp.blueprint_stack_recommendations || []) {
    layerMap[r.layer] = layerMap[r.layer] || []
    layerMap[r.layer].push(r.tool)
  }

  const assumptions: IrisAssumption[] = Object.entries(layerMap).map(([layer, tools]) => ({
    id: layer,
    label: layer.charAt(0).toUpperCase() + layer.slice(1),
    value: tools.join(' + '),
    status: statuses[layer] || 'pending',
  }))

  const coreCount = (bp.blueprint_features || []).filter(
    (f) => f.priority === 'critical' || f.order_index <= 3
  ).length
  const coreWeeks = Math.max(2, Math.ceil(coreCount / 2))

  const phases = [
    { label: 'Discovery & Planning', duration: '1 week' },
    { label: 'Core Development', duration: `${coreWeeks} weeks` },
    { label: 'Integration & Testing', duration: '2 weeks' },
    { label: 'Launch Preparation', duration: '1 week' },
  ]

  return {
    title: bp.summary?.split('.')[0] || 'Your Project',
    description: bp.summary || '',
    phases,
    assumptions,
  }
}

function partialPreview(
  firstMsg: string,
  readiness: number,
  statuses: Record<string, IrisAssumption['status']>
): IrisPreviewData {
  return {
    title: firstMsg.split(' ').slice(0, 6).join(' '),
    description: `AI-generated blueprint based on your requirements. IRIS understands ${readiness}% of your vision.`,
    phases: [
      { label: 'Discovery & Planning', duration: '1 week' },
      { label: 'Core Development', duration: '3 weeks' },
      { label: 'Integration & Testing', duration: '2 weeks' },
      { label: 'Launch Preparation', duration: '1 week' },
    ],
    assumptions: [
      { id: 'tech_stack', label: 'Tech Stack',   value: 'Next.js + TypeScript + Supabase', status: statuses['tech_stack'] || 'pending' },
      { id: 'team_size',  label: 'Team Size',    value: '2–4 developers',                  status: statuses['team_size']  || 'pending' },
      { id: 'timeline',   label: 'Timeline',     value: '7 weeks total',                   status: statuses['timeline']   || 'pending' },
      { id: 'budget',     label: 'Budget',       value: '$15,000–$25,000',                 status: statuses['budget']     || 'pending' },
    ],
  }
}

const sessionKey = (id: string) => `iris_v1_${id}`

// ─── Component ────────────────────────────────────────────────────────────────

export function IrisWorkspace({ userId: _userId }: IrisWorkspaceProps) {
  const router = useRouter()
  const [projectId, setProjectId] = useState<string | null>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id')
      : null
  )
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [messages, setMessages] = useState<IrisMessage[]>([WELCOME])
  const [conversationHistory, setConversationHistory] = useState<ConvMessage[]>([])
  const [readiness, setReadiness] = useState(0)
  const [previewData, setPreviewData] = useState<IrisPreviewData | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [irisComplete, setIrisComplete] = useState(false)
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [assumptionStatuses, setAssumptionStatuses] = useState<
    Record<string, IrisAssumption['status']>
  >({})
  const [activeTab, setActiveTab] = useState<'chat' | 'preview' | 'plan'>('chat')
  const [blueprintError, setBlueprintError] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstUserMsgRef = useRef('')

  // ── Fetch default workspace ────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => r.json())
      .then((d) => { if (d.data?.[0]) setWorkspaceId(d.data[0].id) })
      .catch(console.error)
  }, [])

  // ── Restore session from localStorage ─────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    try {
      const raw = localStorage.getItem(sessionKey(projectId))
      if (!raw) return
      const s = JSON.parse(raw)
      if (s.history)            setConversationHistory(s.history)
      if (s.readiness)          setReadiness(s.readiness)
      if (s.irisComplete)       setIrisComplete(s.irisComplete)
      if (s.firstUserMsg)       firstUserMsgRef.current = s.firstUserMsg
      if (s.assumptionStatuses) setAssumptionStatuses(s.assumptionStatuses)
      if (s.messages) {
        setMessages(s.messages.map((m: IrisMessage) => ({ ...m, timestamp: new Date(m.timestamp) })))
      }
      // Rebuild partial preview so the panel isn't blank on reload
      if (s.firstUserMsg && s.readiness > 0) {
        setPreviewData(partialPreview(s.firstUserMsg, s.readiness, s.assumptionStatuses || {}))
      }
    } catch { /* ignore */ }
  }, [projectId])

  // ── Poll for blueprint once IRIS conversation is complete ─────────────────
  useEffect(() => {
    if (!irisComplete || !projectId || blueprint) return

    setBlueprintError(false)

    const poll = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/blueprint`)
        const d = await r.json()
        if ((d.data?.blueprint_features?.length ?? 0) > 0) {
          setBlueprint(d.data)
          setReadiness(100)
          if (pollingRef.current) clearInterval(pollingRef.current)
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
        }
      } catch { /* non-fatal */ }
    }

    poll()
    pollingRef.current = setInterval(poll, 3000)

    // Timeout after 60 seconds — stop polling and show retry option
    pollTimeoutRef.current = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      setBlueprintError(true)
    }, 60000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [irisComplete, projectId, blueprint])

  // ── Retry blueprint generation ─────────────────────────────────────────────
  const handleRetryBlueprint = useCallback(async () => {
    if (!projectId) return
    setBlueprintError(false)
    try {
      await fetch(`/api/projects/${projectId}/blueprint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    } catch { /* non-fatal — poll will pick it up */ }
    // Restart polling
    const poll = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/blueprint`)
        const d = await r.json()
        if ((d.data?.blueprint_features?.length ?? 0) > 0) {
          setBlueprint(d.data)
          setReadiness(100)
          if (pollingRef.current) clearInterval(pollingRef.current)
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
        }
      } catch { /* non-fatal */ }
    }
    poll()
    pollingRef.current = setInterval(poll, 3000)
    pollTimeoutRef.current = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      setBlueprintError(true)
    }, 60000)
  }, [projectId])

  // ── Re-render preview when blueprint or statuses change ───────────────────
  useEffect(() => {
    if (blueprint) setPreviewData(blueprintToPreview(blueprint, assumptionStatuses))
  }, [blueprint, assumptionStatuses])

  // ── Persist session ───────────────────────────────────────────────────────
  const persist = useCallback(
    (
      pid: string,
      history: ConvMessage[],
      msgs: IrisMessage[],
      r: number,
      complete: boolean,
      statuses: Record<string, IrisAssumption['status']>
    ) => {
      try {
        localStorage.setItem(
          sessionKey(pid),
          JSON.stringify({ history, messages: msgs, readiness: r, irisComplete: complete, assumptionStatuses: statuses, firstUserMsg: firstUserMsgRef.current })
        )
      } catch { /* ignore */ }
    },
    []
  )

  // ── Assumption action (real state update + persist) ───────────────────────
  const handleAssumptionAction = useCallback(
    (id: string, action: 'accepted' | 'rejected' | 'modified', newValue?: string) => {
      setAssumptionStatuses((prev) => {
        const updated = { ...prev, [id]: action }
        if (projectId) {
          try {
            const raw = localStorage.getItem(sessionKey(projectId))
            const saved = raw ? JSON.parse(raw) : {}
            localStorage.setItem(sessionKey(projectId), JSON.stringify({ ...saved, assumptionStatuses: updated }))
          } catch { /* ignore */ }
        }
        return updated
      })
      if (action === 'modified' && newValue) {
        setBlueprint((bp) => {
          if (!bp) return bp
          return {
            ...bp,
            blueprint_stack_recommendations: bp.blueprint_stack_recommendations.map((r) =>
              r.layer === id ? { ...r, tool: newValue } : r
            ),
          }
        })
      }
    },
    [projectId]
  )

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!firstUserMsgRef.current) firstUserMsgRef.current = content

      const userMsg: IrisMessage = { id: Date.now().toString(), role: 'user', content, timestamp: new Date() }
      setMessages((prev) => [...prev, userMsg])
      setIsTyping(true)

      try {
        // Create project on first message
        let pid = projectId
        if (!pid) {
          if (!workspaceId) throw new Error('No workspace found. Please refresh and try again.')
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `New Project ${Date.now()}`, workspace_id: workspaceId, project_type: 'saas' }),
          })
          if (!res.ok) throw new Error(`Could not create project (${res.status})`)
          const d = await res.json()
          pid = d.data?.id ?? null
          if (!pid) throw new Error('Project creation returned no ID')
          setProjectId(pid)
          window.history.replaceState({}, '', `/wizard?id=${pid}`)
        }

        // Call real IRIS API
        const irisRes = await fetch(`/api/projects/${pid}/iris`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, history: conversationHistory }),
        })
        if (!irisRes.ok) {
          const e = await irisRes.json().catch(() => ({}))
          throw new Error(e.error || `IRIS error ${irisRes.status}`)
        }
        const { reply, complete, history: newHistory } = await irisRes.json()

        const updatedHistory: ConvMessage[] =
          newHistory || [...conversationHistory, { role: 'user', content }, { role: 'assistant', content: reply }]
        setConversationHistory(updatedHistory)

        const assistantMsg: IrisMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: reply,
          timestamp: new Date(),
        }

        setMessages((prev) => {
          const all = [...prev, assistantMsg]
          const exchangeCount = updatedHistory.filter((m) => m.role === 'user').length
          const newReadiness = complete ? 90 : Math.min(80, exchangeCount * 12)
          setReadiness(newReadiness)

          // Partial preview while blueprint not yet available
          if (!blueprint) {
            setPreviewData(partialPreview(firstUserMsgRef.current, newReadiness, assumptionStatuses))
          }

          if (complete) setIrisComplete(true)
          persist(pid!, updatedHistory, all, newReadiness, complete, assumptionStatuses)
          return all
        })
      } catch (err) {
        console.error('IRIS send error:', err)
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Sorry, something went wrong: ${err instanceof Error ? err.message : 'Please try again.'}`,
            timestamp: new Date(),
          },
        ])
      } finally {
        setIsTyping(false)
      }
    },
    [projectId, workspaceId, conversationHistory, blueprint, assumptionStatuses, persist]
  )

  // ── Confirm blueprint & seed execution plan ───────────────────────────────
  const handleConfirmBlueprint = useCallback(async () => {
    if (!projectId || isConfirming) return
    setIsConfirming(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/blueprint/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (res.ok) {
        // Clear local session so a fresh reload doesn't re-trigger polling
        try { localStorage.removeItem(sessionKey(projectId)) } catch { /* ignore */ }
        router.push(`/projects/${projectId}`)
      } else {
        console.error('[confirm] failed:', d.error)
      }
    } catch (err) {
      console.error('[confirm] error:', err)
    } finally {
      setIsConfirming(false)
    }
  }, [projectId, isConfirming, router])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="iris-workspace">
      <IrisStatusBar readiness={readiness} messageCount={messages.length - 1} />

      {blueprintError && (
        <div className="iris-blueprint-error">
          <span>Blueprint generation is taking longer than expected.</span>
          <button onClick={handleRetryBlueprint} className="iris-retry-btn">Retry Blueprint</button>
        </div>
      )}

      <div className="iris-split">
        <div className="iris-chat-pane">
          <IrisChat messages={messages} isTyping={isTyping} onSend={handleSendMessage} readiness={readiness} />
        </div>
        <div className="iris-preview-pane">
          <IrisPreviewPanel
            data={previewData}
            readiness={readiness}
            isBuilding={isTyping || (irisComplete && !blueprint && !blueprintError)}
            onAssumptionAction={handleAssumptionAction}
            onConfirm={blueprint ? handleConfirmBlueprint : undefined}
            isConfirming={isConfirming}
          />
        </div>
      </div>

      <IrisMobileTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        messages={messages}
        isTyping={isTyping}
        onSend={handleSendMessage}
        readiness={readiness}
        previewData={previewData}
        isBuilding={isTyping || (irisComplete && !blueprint && !blueprintError)}
        onAssumptionAction={handleAssumptionAction}
        onConfirm={blueprint ? handleConfirmBlueprint : undefined}
        isConfirming={isConfirming}
      />
    </div>
  )
}
