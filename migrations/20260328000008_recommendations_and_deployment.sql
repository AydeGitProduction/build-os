-- ============================================================
-- BUILD OS — Migration 008: Recommendations & Deployment
-- ============================================================

-- ─── recommendation_reports ──────────────────────────────────────────────────
CREATE TABLE recommendation_reports (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id            uuid        NOT NULL,
  triggered_by          text        NOT NULL,
  maturity_signals      jsonb       NOT NULL DEFAULT '{}',
  items                 jsonb       NOT NULL DEFAULT '[]',
  required_now_count    integer     NOT NULL DEFAULT 0,
  recommended_count     integer     NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT recommendation_reports_pkey              PRIMARY KEY (id),
  CONSTRAINT recommendation_reports_project_fk        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT recommendation_reports_trigger_check     CHECK (triggered_by IN ('blueprint','maturity_signal','scheduled','manual')),
  CONSTRAINT recommendation_reports_status_check      CHECK (status IN ('active','dismissed','superseded'))
);

CREATE INDEX idx_recommendation_reports_project_id ON recommendation_reports (project_id);
CREATE INDEX idx_recommendation_reports_status     ON recommendation_reports (status);

ALTER TABLE recommendation_reports ENABLE ROW LEVEL SECURITY;

-- ─── domains ─────────────────────────────────────────────────────────────────
CREATE TABLE domains (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  domain      text        NOT NULL,
  is_primary  boolean     NOT NULL DEFAULT false,
  dns_status  text        NOT NULL DEFAULT 'pending',
  ssl_status  text        NOT NULL DEFAULT 'pending',
  provider    text,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT domains_pkey                 PRIMARY KEY (id),
  CONSTRAINT domains_domain_unique        UNIQUE (domain),
  CONSTRAINT domains_project_fk          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT domains_dns_status_check    CHECK (dns_status IN ('pending','configured','verified','failed')),
  CONSTRAINT domains_ssl_status_check    CHECK (ssl_status IN ('pending','provisioning','active','failed')),
  CONSTRAINT domains_provider_check      CHECK (provider IN ('cloudflare','vercel','netlify','other') OR provider IS NULL)
);

CREATE INDEX idx_domains_project_id ON domains (project_id);

CREATE TRIGGER domains_updated_at
  BEFORE UPDATE ON domains
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

-- ─── deployment_targets ──────────────────────────────────────────────────────
CREATE TABLE deployment_targets (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id            uuid        NOT NULL,
  environment_id        uuid        NOT NULL,
  provider              text        NOT NULL,
  target_config         jsonb       NOT NULL DEFAULT '{}',
  last_deployment_id    text,
  last_deployed_at      timestamptz,
  status                text        NOT NULL DEFAULT 'inactive',
  health_url            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT deployment_targets_pkey             PRIMARY KEY (id),
  CONSTRAINT deployment_targets_proj_env_uq      UNIQUE (project_id, environment_id),
  CONSTRAINT deployment_targets_project_fk       FOREIGN KEY (project_id)     REFERENCES projects(id)             ON DELETE CASCADE,
  CONSTRAINT deployment_targets_env_fk           FOREIGN KEY (environment_id) REFERENCES project_environments(id) ON DELETE CASCADE,
  CONSTRAINT deployment_targets_provider_check   CHECK (provider IN ('vercel','netlify','cloudflare','custom')),
  CONSTRAINT deployment_targets_status_check     CHECK (status IN ('inactive','deploying','live','failed'))
);

CREATE INDEX idx_deployment_targets_project_id ON deployment_targets (project_id);

CREATE TRIGGER deployment_targets_updated_at
  BEFORE UPDATE ON deployment_targets
  FOR EACH ROW EXECUTE FUNCTION buildos_set_updated_at();

ALTER TABLE deployment_targets ENABLE ROW LEVEL SECURITY;
