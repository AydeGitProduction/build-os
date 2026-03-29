-- ============================================================
-- BUILD OS — Migration 002: Integrations
-- ============================================================

-- ─── integration_providers ───────────────────────────────────────────────────
CREATE TABLE integration_providers (
  id                uuid          NOT NULL DEFAULT gen_random_uuid(),
  name              text          NOT NULL,
  display_name      text          NOT NULL,
  category          text          NOT NULL,
  auth_type         text          NOT NULL,
  required_fields   jsonb         NOT NULL DEFAULT '[]',
  optional_fields   jsonb         NOT NULL DEFAULT '[]',
  health_check_url  text,
  docs_url          text,
  is_active         boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT integration_providers_pkey         PRIMARY KEY (id),
  CONSTRAINT integration_providers_name_unique  UNIQUE (name),
  CONSTRAINT integration_providers_cat_check    CHECK (category IN ('AI','VCS','DEPLOYMENT','EMAIL','SMS','ANALYTICS','BILLING','DATABASE','CDN','OBSERVABILITY')),
  CONSTRAINT integration_providers_auth_check   CHECK (auth_type IN ('API_KEY','OAUTH2','BASIC','SERVICE_ACCOUNT'))
);

-- Seed core providers
INSERT INTO integration_providers (name, display_name, category, auth_type, required_fields) VALUES
  ('anthropic',   'Anthropic',   'AI',         'API_KEY',  '["api_key"]'),
  ('openai',      'OpenAI',      'AI',         'API_KEY',  '["api_key"]'),
  ('supabase',    'Supabase',    'DATABASE',   'API_KEY',  '["project_url","service_role_key"]'),
  ('github',      'GitHub',      'VCS',        'OAUTH2',   '["access_token"]'),
  ('n8n',         'n8n',         'DEPLOYMENT', 'API_KEY',  '["base_url","api_key"]'),
  ('vercel',      'Vercel',      'DEPLOYMENT', 'API_KEY',  '["token","team_id"]'),
  ('netlify',     'Netlify',     'DEPLOYMENT', 'API_KEY',  '["access_token"]'),
  ('cloudflare',  'Cloudflare',  'CDN',        'API_KEY',  '["api_token","zone_id"]'),
  ('sendgrid',    'SendGrid',    'EMAIL',      'API_KEY',  '["api_key"]'),
  ('resend',      'Resend',      'EMAIL',      'API_KEY',  '["api_key"]'),
  ('stripe',      'Stripe',      'BILLING',    'API_KEY',  '["publishable_key","secret_key"]'),
  ('posthog',     'PostHog',     'ANALYTICS',  'API_KEY',  '["project_api_key","host"]'),
  ('sentry',      'Sentry',      'OBSERVABILITY','API_KEY',  '["dsn"]');

-- ─── credentials ─────────────────────────────────────────────────────────────
CREATE TABLE credentials (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL,
  provider_id         uuid        NOT NULL,
  label               text        NOT NULL,
  encrypted_values    bytea       NOT NULL,
  encryption_key_ref  text        NOT NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  expires_at          timestamptz,
  created_by          uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credentials_pkey         PRIMARY KEY (id),
  CONSTRAINT credentials_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id)             ON DELETE CASCADE,
  CONSTRAINT credentials_provider_fk  FOREIGN KEY (provider_id)  REFERENCES integration_providers(id) ON DELETE RESTRICT,
  CONSTRAINT credentials_creator_fk   FOREIGN KEY (created_by)   REFERENCES users(id)                 ON DELETE RESTRICT
);

CREATE INDEX idx_credentials_workspace_id ON credentials (workspace_id) WHERE is_active = true;
CREATE INDEX idx_credentials_provider_id  ON credentials (provider_id);

CREATE TRIGGER credentials_updated_at
  BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- ─── project_integrations ────────────────────────────────────────────────────
CREATE TABLE project_integrations (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id            uuid        NOT NULL,
  provider_id           uuid        NOT NULL,
  credential_id         uuid        NOT NULL,
  status                text        NOT NULL DEFAULT 'pending',
  environment_map       jsonb       NOT NULL DEFAULT '{}',
  last_health_check_at  timestamptz,
  last_error            text,
  created_by            uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_integrations_pkey          PRIMARY KEY (id),
  CONSTRAINT project_integrations_proj_prov_uq  UNIQUE (project_id, provider_id),
  CONSTRAINT project_integrations_project_fk    FOREIGN KEY (project_id)    REFERENCES projects(id)              ON DELETE CASCADE,
  CONSTRAINT project_integrations_provider_fk   FOREIGN KEY (provider_id)   REFERENCES integration_providers(id) ON DELETE RESTRICT,
  CONSTRAINT project_integrations_cred_fk       FOREIGN KEY (credential_id) REFERENCES credentials(id)           ON DELETE RESTRICT,
  CONSTRAINT project_integrations_creator_fk    FOREIGN KEY (created_by)    REFERENCES users(id)                 ON DELETE RESTRICT,
  CONSTRAINT project_integrations_status_check  CHECK (status IN ('pending','active','degraded','failed','revoked','expired'))
);

CREATE INDEX idx_project_integrations_project_id  ON project_integrations (project_id);
CREATE INDEX idx_project_integrations_provider_id ON project_integrations (provider_id);
CREATE INDEX idx_project_integrations_status      ON project_integrations (status);

CREATE TRIGGER project_integrations_updated_at
  BEFORE UPDATE ON project_integrations
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE project_integrations ENABLE ROW LEVEL SECURITY;
