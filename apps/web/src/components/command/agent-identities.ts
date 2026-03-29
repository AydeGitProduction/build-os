// ─── Agent Identities ─────────────────────────────────────────────────────────
// Humanized agent personalities used across all Command Center components.

export interface AgentIdentity {
  role: string
  name: string         // humanized name shown in UI
  shortName: string    // compact version for tight spaces
  emoji: string
  initials: string     // for avatar fallback
  color: string        // Tailwind text color
  bg: string           // Tailwind bg color
  ring: string         // Tailwind ring/border color
  description: string  // one-line tooltip
}

export const AGENT_IDENTITIES: AgentIdentity[] = [
  {
    role:        'solution_architect',
    name:        'Iris · Architect',
    shortName:   'Iris',
    emoji:       '🏗️',
    initials:    'IR',
    color:       'text-violet-700',
    bg:          'bg-violet-50',
    ring:        'border-violet-200',
    description: 'System design, architecture decisions & planning',
  },
  {
    role:        'backend_engineer',
    name:        'Atlas · Backend',
    shortName:   'Atlas',
    emoji:       '⚙️',
    initials:    'AT',
    color:       'text-blue-700',
    bg:          'bg-blue-50',
    ring:        'border-blue-200',
    description: 'APIs, databases, server logic & infrastructure',
  },
  {
    role:        'frontend_engineer',
    name:        'Nova · Frontend',
    shortName:   'Nova',
    emoji:       '🎨',
    initials:    'NV',
    color:       'text-pink-700',
    bg:          'bg-pink-50',
    ring:        'border-pink-200',
    description: 'UI components, pages, styling & UX',
  },
  {
    role:        'integration_engineer',
    name:        'Flux · Integrations',
    shortName:   'Flux',
    emoji:       '🔌',
    initials:    'FX',
    color:       'text-teal-700',
    bg:          'bg-teal-50',
    ring:        'border-teal-200',
    description: 'Third-party services, webhooks & data flows',
  },
  {
    role:        'qa_security_auditor',
    name:        'Sentinel · QA',
    shortName:   'Sentinel',
    emoji:       '🛡️',
    initials:    'SN',
    color:       'text-green-700',
    bg:          'bg-green-50',
    ring:        'border-green-200',
    description: 'Security audits, test coverage & quality gates',
  },
  {
    role:        'documentation_engineer',
    name:        'Echo · Docs',
    shortName:   'Echo',
    emoji:       '📝',
    initials:    'EC',
    color:       'text-amber-700',
    bg:          'bg-amber-50',
    ring:        'border-amber-200',
    description: 'Technical documentation, specs & changelogs',
  },
  {
    role:        'cost_analyst',
    name:        'Ledger · Cost',
    shortName:   'Ledger',
    emoji:       '💰',
    initials:    'LD',
    color:       'text-slate-700',
    bg:          'bg-slate-100',
    ring:        'border-slate-200',
    description: 'Budget tracking, cost optimization & reporting',
  },
]

export const AGENT_BY_ROLE = Object.fromEntries(
  AGENT_IDENTITIES.map(a => [a.role, a])
) as Record<string, AgentIdentity>

/** Returns identity for a role, or a sensible fallback. */
export function getAgent(role: string): AgentIdentity {
  return AGENT_BY_ROLE[role] ?? {
    role,
    name:        role,
    shortName:   role,
    emoji:       '🤖',
    initials:    role.slice(0, 2).toUpperCase(),
    color:       'text-slate-600',
    bg:          'bg-slate-100',
    ring:        'border-slate-200',
    description: role,
  }
}

/** Agent avatar component helper — returns class strings for the avatar circle */
export function agentAvatarClasses(role: string): { bg: string; color: string; ring: string } {
  const a = getAgent(role)
  return { bg: a.bg, color: a.color, ring: a.ring }
}
