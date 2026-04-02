// src/types/integration-providers.ts
// WS1-3: Updated to reflect all 13 providers + slug field

export type AuthType = 'api_key' | 'oauth2' | 'dsn';

export type IntegrationProviderCategory =
  | 'ai'
  | 'database'
  | 'hosting'
  | 'cdn'
  | 'devops'
  | 'automation'
  | 'email'
  | 'payments'
  | 'analytics'
  | 'monitoring';

export type IntegrationProviderSlug =
  | 'anthropic'
  | 'openai'
  | 'supabase'
  | 'github'
  | 'vercel'
  | 'n8n'
  | 'netlify'
  | 'cloudflare'
  | 'sendgrid'
  | 'resend'
  | 'stripe'
  | 'posthog'
  | 'sentry';

export interface IntegrationProvider {
  id: string;
  name: string;
  slug: IntegrationProviderSlug;
  category: IntegrationProviderCategory;
  auth_type: AuthType;
  created_at?: string;
  updated_at?: string;
}

// Compile-time exhaustiveness: exactly 13 slugs
export const INTEGRATION_PROVIDER_SLUGS: readonly IntegrationProviderSlug[] = [
  'anthropic',
  'openai',
  'supabase',
  'github',
  'vercel',
  'n8n',
  'netlify',
  'cloudflare',
  'sendgrid',
  'resend',
  'stripe',
  'posthog',
  'sentry',
] as const;

// Runtime guard
if (INTEGRATION_PROVIDER_SLUGS.length !== 13) {
  throw new Error(
    `Expected 13 integration providers, found ${INTEGRATION_PROVIDER_SLUGS.length}`
  );
}