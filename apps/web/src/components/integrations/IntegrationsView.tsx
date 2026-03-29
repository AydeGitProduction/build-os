'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ConnectIntegrationModal from './ConnectIntegrationModal'
import { CheckCircle, Circle, XCircle, Plus, Unlink } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Provider {
  id: string
  name: string
  slug: string
  category: string
  auth_type: string
  description: string
  required_fields?: string[]
  optional_fields?: string[]
}

interface ProjectIntegration {
  id: string
  provider_id: string
  status: string
  environment: string
  created_at: string
}

interface IntegrationsViewProps {
  projectId: string
  providers: Provider[]
  projectIntegrations: ProjectIntegration[]
}

const CATEGORY_LABELS: Record<string, string> = {
  payment:            'Payments',
  source_control:     'Source Control',
  project_management: 'Project Management',
  communication:      'Communication',
  knowledge:          'Knowledge',
  crm:                'CRM',
  ci_cd:              'CI / CD',
  storage:            'Storage',
  ai:                 'AI',
  monitoring:         'Monitoring',
  other:              'Other',
}

export default function IntegrationsView({
  projectId,
  providers,
  projectIntegrations,
}: IntegrationsViewProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Provider | null>(null)
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({})
  const [integrations, setIntegrations] = useState(projectIntegrations)

  const activeByProvider = integrations.reduce((acc: Record<string, ProjectIntegration[]>, pi) => {
    if (!acc[pi.provider_id]) acc[pi.provider_id] = []
    acc[pi.provider_id].push(pi)
    return acc
  }, {})

  const handleDisconnect = async (integrationId: string) => {
    setDisconnecting(prev => ({ ...prev, [integrationId]: true }))
    try {
      const res = await fetch(`/api/integrations/connect?integration_id=${integrationId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setIntegrations(prev => prev.filter(i => i.id !== integrationId))
        router.refresh()
      }
    } finally {
      setDisconnecting(prev => ({ ...prev, [integrationId]: false }))
    }
  }

  const handleConnectSuccess = () => {
    setSelected(null)
    router.refresh()
  }

  // Group providers by category
  const grouped: Record<string, Provider[]> = {}
  for (const p of providers) {
    if (!grouped[p.category]) grouped[p.category] = []
    grouped[p.category].push(p)
  }

  return (
    <>
      <div className="space-y-8">
        {Object.entries(grouped).map(([category, categoryProviders]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              {CATEGORY_LABELS[category] || category}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {categoryProviders.map((provider) => {
                const pIntegrations = activeByProvider[provider.id] || []
                const hasActive = pIntegrations.some(pi => pi.status === 'active')
                const envs = pIntegrations.filter(pi => pi.status === 'active').map(pi => pi.environment)

                return (
                  <Card
                    key={provider.id}
                    padding="md"
                    className={`transition-all ${hasActive ? 'border-green-200 bg-green-50/40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{provider.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{provider.description}</p>
                      </div>
                      {hasActive ? (
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mb-3">
                      <Badge variant="outline" className="text-[10px]">{provider.auth_type}</Badge>
                      {envs.map(env => (
                        <Badge key={env} className="text-[10px] bg-green-100 text-green-700 capitalize">{env}</Badge>
                      ))}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {/* Connect button */}
                      <Button
                        size="sm"
                        variant={hasActive ? 'outline' : 'primary'}
                        className="w-full"
                        leftIcon={<Plus className="h-3 w-3" />}
                        onClick={() => setSelected(provider)}
                      >
                        {hasActive ? 'Add environment' : 'Connect'}
                      </Button>

                      {/* Disconnect buttons */}
                      {pIntegrations.filter(pi => pi.status === 'active').map(pi => (
                        <Button
                          key={pi.id}
                          size="sm"
                          variant="ghost"
                          className="w-full text-red-600 hover:bg-red-50"
                          loading={disconnecting[pi.id]}
                          leftIcon={<Unlink className="h-3 w-3" />}
                          onClick={() => handleDisconnect(pi.id)}
                        >
                          Disconnect {pi.environment}
                        </Button>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Connect modal */}
      {selected && (
        <ConnectIntegrationModal
          projectId={projectId}
          provider={selected}
          onClose={() => setSelected(null)}
          onSuccess={handleConnectSuccess}
        />
      )}
    </>
  )
}
