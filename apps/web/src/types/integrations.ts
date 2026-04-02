// src/types/integrations.ts

export type ConnectionStatus = 'connected' | 'expired' | 'error' | 'not_connected';

export interface ProviderConnection {
  id: string;
  provider_id: string;
  user_id: string;
  status: ConnectionStatus;
  metadata: {
    username?: string;
    email?: string;
    avatar_url?: string;
    account_id?: string;
    scopes?: string[];
    [key: string]: unknown;
  };
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
  error_message?: string;
}

export interface Provider {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon_url: string;
  category: string;
  auth_type: 'oauth2' | 'api_key' | 'basic';
  docs_url?: string;
}

export interface ProviderWithConnection extends Provider {
  connection: ProviderConnection | null;
}

export interface TestConnectionResult {
  success: boolean;
  status: ConnectionStatus;
  message: string;
  tested_at: string;
  latency_ms?: number;
}

export interface IntegrationsResponse {
  providers: ProviderWithConnection[];
}