-- migrations/0042_project_integrations.sql
-- Adds the project_integrations table required by this route.

create type integration_provider as enum ('github', 'vercel', 'supabase');
create type integration_status   as enum ('connected', 'disconnected', 'error', 'pending', 'unknown');
create type integration_mode     as enum ('user_managed', 'platform_managed');

create table if not exists project_integrations (
  id                           uuid primary key default gen_random_uuid(),
  project_id                   uuid not null references projects(id) on delete cascade,
  provider                     integration_provider not null,
  status                       integration_status   not null default 'disconnected',
  mode                         integration_mode     not null default 'platform_managed',
  -- Stores provider-specific details: tokens (encrypted at rest via vault),
  -- usernames, repo slugs, team ids, etc.
  metadata                     jsonb not null default '{}',
  last_health_check_at         timestamptz,
  last_health_check_latency_ms integer,
  last_health_check_error      text,
  environment                  text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  -- One row per provider per project
  unique (project_id, provider)
);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_integrations_updated_at
  before update on project_integrations
  for each row execute function set_updated_at();

-- RLS
alter table project_integrations enable row level security;

-- Owners + members can read their project's integrations
create policy "project members can read integrations"
  on project_integrations for select
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members where user_id = auth.uid()
    )
  );

-- Only owners can insert / update / delete integrations
create policy "project owners can manage integrations"
  on project_integrations for all
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()
    )
  );

-- Index for primary access pattern
create index idx_project_integrations_project_id
  on project_integrations (project_id);