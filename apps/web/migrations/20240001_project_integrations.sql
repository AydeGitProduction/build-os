-- migrations/20240001_project_integrations.sql
-- (Reference only — not a deliverable, included for context)

create table if not exists project_integrations (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid not null references projects(id) on delete cascade,
  provider                    text not null check (provider in ('github', 'vercel', 'supabase')),
  mode                        text not null check (mode in ('user_managed', 'platform_managed')),

  -- External identifiers
  external_id                 text,
  external_username           text,
  external_team_id            text,
  external_project_ref        text,
  repository                  text,
  deployment_url              text,
  region                      text,
  environment                 text,
  scopes                      text[],
  installation_id             bigint,
  organization_id             text,

  -- Status
  status                      text not null default 'unknown'
                              check (status in ('connected','disconnected','degraded','error','unknown')),

  -- Health check (populated by background worker)
  last_health_check_at        timestamptz,
  last_health_check_reachable boolean,
  last_health_check_latency_ms integer,
  last_health_check_error     text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  unique (project_id, provider)
);

-- RLS: users may only read integrations for projects they belong to
alter table project_integrations enable row level security;

create policy "members can read project integrations"
  on project_integrations for select
  using (
    exists (
      select 1 from projects p
      left join organization_members om on om.organization_id = p.organization_id
      left join project_members pm on pm.project_id = p.id
      where p.id = project_integrations.project_id
        and (
          p.created_by = auth.uid()
          or (om.user_id = auth.uid() and om.is_active = true)
          or (pm.user_id = auth.uid() and pm.is_active = true)
        )
    )
  );