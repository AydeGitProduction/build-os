'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Card, { CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input, { Textarea, Select } from '@/components/ui/Input'
import ProgressBar from '@/components/ui/ProgressBar'
import { CheckCircle, ArrowLeft, ArrowRight, Zap, AlertTriangle } from 'lucide-react'

interface Step {
  id: string
  title: string
  description: string
  fields: Field[]
}

interface Field {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'boolean'
  placeholder?: string
  hint?: string
  required?: boolean
  options?: string[]
}

const STEPS: Step[] = [
  {
    id: 'product',
    title: 'Product basics',
    description: 'Tell us about the core product you\'re building.',
    fields: [
      { id: 'product_name',    label: 'Product name',                         type: 'text',     required: true,  placeholder: 'e.g. Acme CRM' },
      { id: 'target_audience', label: 'Target audience',                       type: 'text',     required: true,  placeholder: 'e.g. B2B SaaS founders, freelance designers' },
      { id: 'core_problem',    label: 'Core problem it solves',                type: 'textarea', required: true,  placeholder: 'Describe the pain point in 2–3 sentences…' },
    ],
  },
  {
    id: 'features',
    title: 'Key features',
    description: 'What are the most important things your product needs to do?',
    fields: [
      { id: 'key_features', label: 'List your 3–5 key features', type: 'textarea', required: true,
        placeholder: '1. User authentication and team management\n2. Real-time collaboration\n3. Analytics dashboard\n4. Stripe billing integration\n5. API access for developers',
        hint: 'One feature per line works best' },
    ],
  },
  {
    id: 'business',
    title: 'Business model',
    description: 'How will this generate revenue and which integrations do you need?',
    fields: [
      { id: 'monetisation', label: 'Monetisation model', type: 'select', required: true,
        options: ['Subscription', 'One-time purchase', 'Freemium', 'Usage-based', 'Marketplace', 'Other'] },
      { id: 'integrations_needed', label: 'Required integrations (select all that apply)', type: 'multiselect',
        options: ['Stripe', 'GitHub', 'Linear', 'Slack', 'Notion', 'HubSpot', 'Zapier', 'Resend', 'Twilio', 'AWS S3', 'Other'] },
    ],
  },
  {
    id: 'technical',
    title: 'Technical requirements',
    description: 'Help us understand your technical needs so we can recommend the right stack.',
    fields: [
      { id: 'ai_features', label: 'Do you need AI / LLM features?', type: 'boolean' },
      { id: 'compliance',  label: 'Compliance requirements', type: 'text',
        placeholder: 'e.g. GDPR, HIPAA, SOC2 — or leave blank',
        hint: 'Leave blank if none required' },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline & budget',
    description: 'Rough constraints help Build OS flag risks and prioritise work.',
    fields: [
      { id: 'timeline_weeks', label: 'Target delivery timeline (weeks)', type: 'number',
        placeholder: '12', hint: 'Approximate — used for risk assessment' },
      { id: 'budget_usd',     label: 'Approximate budget (USD)',         type: 'number',
        placeholder: '50000', hint: 'Used for cost modelling and agent hour allocation' },
    ],
  },
]

interface OnboardingWizardProps {
  projectId: string
  projectName: string
}

export default function OnboardingWizard({ projectId, projectName }: OnboardingWizardProps) {
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers]         = useState<Record<string, string>>({})
  const [selected, setSelected]       = useState<Record<string, string[]>>({})
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [generating, setGenerating]   = useState(false)

  const step = STEPS[currentStep]
  const totalSteps = STEPS.length
  const progress = Math.round(((currentStep) / totalSteps) * 100)

  const getValue = (fieldId: string) => answers[fieldId] || ''
  const getSelected = (fieldId: string) => selected[fieldId] || []

  const setValue = (fieldId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  const toggleMultiSelect = (fieldId: string, option: string) => {
    setSelected(prev => {
      const current = prev[fieldId] || []
      const next = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option]
      return { ...prev, [fieldId]: next }
    })
  }

  const validateStep = () => {
    for (const field of step.fields) {
      if (field.required && !getValue(field.id).trim()) {
        setError(`"${field.label}" is required.`)
        return false
      }
    }
    setError(null)
    return true
  }

  const handleNext = () => {
    if (!validateStep()) return

    // Merge multiselect values into answers
    const updatedAnswers = { ...answers }
    for (const field of step.fields) {
      if (field.type === 'multiselect') {
        updatedAnswers[field.id] = getSelected(field.id).join(', ')
      }
    }
    setAnswers(updatedAnswers)

    if (currentStep < totalSteps - 1) {
      setCurrentStep(s => s + 1)
      setError(null)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1)
      setError(null)
    }
  }

  const handleFinish = async () => {
    if (!validateStep()) return

    const finalAnswers = { ...answers }
    for (const field of step.fields) {
      if (field.type === 'multiselect') {
        finalAnswers[field.id] = getSelected(field.id).join(', ')
      }
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Save questionnaire answers
      const qRes = await fetch(`/api/projects/${projectId}/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers, status: 'completed' }),
      })

      if (!qRes.ok) {
        const json = await qRes.json()
        setError(json.error || 'Failed to save answers')
        return
      }

      // 2. Generate blueprint
      setGenerating(true)
      const bpRes = await fetch(`/api/projects/${projectId}/blueprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!bpRes.ok) {
        const json = await bpRes.json()
        setError(json.error || 'Failed to generate blueprint')
        return
      }

      // 3. Seed tasks from blueprint
      const taskRes = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'blueprint' }),
      })

      if (!taskRes.ok && taskRes.status !== 409) {
        // 409 = already seeded, that's fine
        const json = await taskRes.json()
        setError(json.error || 'Failed to seed execution plan')
        return
      }

      // Navigate to dashboard
      router.push(`/projects/${projectId}`)
      router.refresh()
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
      setGenerating(false)
    }
  }

  const isLastStep = currentStep === totalSteps - 1

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-4 border-brand-100 border-t-brand-500 animate-spin" />
          <Zap className="absolute inset-0 m-auto h-6 w-6 text-brand-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Generating your blueprint…</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Build OS is analysing your requirements and generating your architecture blueprint, tech stack
          recommendations, and full execution plan.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress header */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Step {currentStep + 1} of {totalSteps}</span>
          <span>{progress}% complete</span>
        </div>
        <ProgressBar value={progress} size="sm" color="brand" />

        {/* Step tabs */}
        <div className="flex mt-4 gap-1">
          {STEPS.map((s, idx) => (
            <div
              key={s.id}
              className={`flex-1 h-1 rounded-full transition-colors ${
                idx < currentStep ? 'bg-brand-500' :
                idx === currentStep ? 'bg-brand-300' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step card */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{step.title}</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
          </div>
          {currentStep > 0 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: currentStep }).map((_, i) => (
                <CheckCircle key={i} className="h-4 w-4 text-green-500" />
              ))}
            </div>
          )}
        </CardHeader>

        <div className="space-y-5">
          {step.fields.map(field => {
            if (field.type === 'text') {
              return (
                <Input
                  key={field.id}
                  label={field.label}
                  value={getValue(field.id)}
                  onChange={e => setValue(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  hint={field.hint}
                  required={field.required}
                />
              )
            }

            if (field.type === 'textarea') {
              return (
                <Textarea
                  key={field.id}
                  label={field.label}
                  value={getValue(field.id)}
                  onChange={e => setValue(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  hint={field.hint}
                  required={field.required}
                />
              )
            }

            if (field.type === 'number') {
              return (
                <Input
                  key={field.id}
                  label={field.label}
                  type="number"
                  value={getValue(field.id)}
                  onChange={e => setValue(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  hint={field.hint}
                  min={0}
                />
              )
            }

            if (field.type === 'select' && field.options) {
              return (
                <Select
                  key={field.id}
                  label={field.label}
                  value={getValue(field.id)}
                  onChange={e => setValue(field.id, e.target.value)}
                  options={field.options.map(o => ({ value: o, label: o }))}
                  placeholder="Select an option…"
                  required={field.required}
                  hint={field.hint}
                />
              )
            }

            if (field.type === 'multiselect' && field.options) {
              return (
                <div key={field.id} className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">{field.label}</label>
                  <div className="flex flex-wrap gap-2">
                    {field.options.map(option => {
                      const isSelected = getSelected(field.id).includes(option)
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleMultiSelect(field.id, option)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                            isSelected
                              ? 'bg-brand-50 border-brand-300 text-brand-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected && <span className="mr-1.5">✓</span>}
                          {option}
                        </button>
                      )
                    })}
                  </div>
                  {field.hint && <p className="text-xs text-slate-500">{field.hint}</p>}
                </div>
              )
            }

            if (field.type === 'boolean') {
              return (
                <div key={field.id} className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">{field.label}</label>
                  <div className="flex gap-3">
                    {['Yes', 'No'].map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setValue(field.id, option)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                          getValue(field.id) === option
                            ? 'bg-brand-50 border-brand-300 text-brand-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }

            return null
          })}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">{error}</p>
            </div>
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
            leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            Back
          </Button>

          {isLastStep ? (
            <Button
              onClick={handleFinish}
              loading={loading}
              rightIcon={<Zap className="h-3.5 w-3.5" />}
            >
              Generate blueprint
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              Continue
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
