'use client'

import { useState } from 'react'
import Card, { CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { Lock, X, Shield, Eye, EyeOff } from 'lucide-react'

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

interface ConnectIntegrationModalProps {
  projectId: string
  provider: Provider
  onClose: () => void
  onSuccess: () => void
}

const FIELD_LABELS: Record<string, string> = {
  api_key:       'API Key',
  api_secret:    'API Secret',
  access_token:  'Access Token',
  refresh_token: 'Refresh Token',
  client_id:     'Client ID',
  client_secret: 'Client Secret',
  webhook_secret: 'Webhook Secret',
  base_url:      'Base URL',
  org_id:        'Organisation ID',
  account_id:    'Account ID',
  database_url:  'Database URL',
  token:         'Token',
}

const SENSITIVE_FIELDS = new Set(['api_key', 'api_secret', 'access_token', 'refresh_token', 'client_secret', 'webhook_secret', 'token', 'database_url'])

export default function ConnectIntegrationModal({
  projectId,
  provider,
  onClose,
  onSuccess,
}: ConnectIntegrationModalProps) {
  const [values, setValues]     = useState<Record<string, string>>({})
  const [environment, setEnv]   = useState('development')
  const [label, setLabel]       = useState(`${provider.name} (development)`)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const requiredFields = provider.required_fields || []
  const optionalFields = provider.optional_fields || []
  const allFields = [...requiredFields, ...optionalFields]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Client-side required field check
    const missing = requiredFields.filter(f => !values[f]?.trim())
    if (missing.length > 0) {
      setError(`Required fields: ${missing.map(f => FIELD_LABELS[f] || f).join(', ')}`)
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          provider_id: provider.id,
          environment,
          label,
          credential_values: values,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to connect integration')
        return
      }

      onSuccess()
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <Card className="w-full max-w-lg" padding="none">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <Lock className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Connect {provider.name}</h3>
              <p className="text-xs text-slate-500 capitalize">{provider.category} · {provider.auth_type}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Security notice */}
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
          <Shield className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <p className="text-xs text-green-700">
            Credentials are encrypted with AES-256-GCM before storage.
            Plaintext values are never persisted or logged.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Label */}
          <Input
            label="Connection label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            hint="Helps identify this connection"
          />

          {/* Environment */}
          <Select
            label="Environment"
            value={environment}
            onChange={e => {
              setEnv(e.target.value)
              setLabel(`${provider.name} (${e.target.value})`)
            }}
            options={[
              { value: 'development', label: 'Development' },
              { value: 'staging',     label: 'Staging' },
              { value: 'production',  label: 'Production' },
            ]}
          />

          {/* Credential fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Credentials</p>

            {allFields.map(field => {
              const isSensitive = SENSITIVE_FIELDS.has(field)
              const isRequired  = requiredFields.includes(field)
              const isRevealed  = revealed[field]

              return (
                <div key={field} className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    {FIELD_LABELS[field] || field}
                    {isRequired && <span className="ml-0.5 text-red-500">*</span>}
                    {!isRequired && <span className="ml-1 text-xs text-slate-400">(optional)</span>}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={isSensitive && !isRevealed ? 'password' : 'text'}
                      value={values[field] || ''}
                      onChange={e => setValues(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder={isSensitive ? '••••••••' : `Enter ${FIELD_LABELS[field] || field}`}
                      className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 pr-9"
                      autoComplete="off"
                    />
                    {isSensitive && (
                      <button
                        type="button"
                        onClick={() => setRevealed(prev => ({ ...prev, [field]: !prev[field] }))}
                        className="absolute right-3 text-slate-400 hover:text-slate-600"
                      >
                        {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading} leftIcon={<Lock className="h-3.5 w-3.5" />}>
              Connect & encrypt
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
