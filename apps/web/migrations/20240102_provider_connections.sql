-- migrations/20240102_provider_connections.sql
-- Run this in your Supabase SQL editor or as a migration file

create table if not exists public.provider_connections (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null check (provider in ('supabase', 'github', 'slack', 'linear')),
  access_token_ref text not null,         -- stores the actual key (encrypt in prod)
  status        text not null default 'active' check (status in ('active', 'inactive', 'error')),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- one connection per provider per workspace
  unique (workspace_id, provider)
);

-- RLS: service role bypasses; normal users can only see their workspace connections
alter table public.provider_connections enable row level security;

create policy "workspace members can read own connections"
  on public.provider_connections for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = provider_connections.workspace_id
        and wm.user_id = auth.uid()
    )
    or
    exists (
      select 1 from public.workspaces w
      where w.id = provider_connections.workspace_id
        and w.owner_id = auth.uid()
    )
  );

create policy "workspace members can insert connections"
  on public.provider_connections for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = provider_connections.workspace_id
        and wm.user_id = auth.uid()
    )
    or
    exists (
      select 1 from public.workspaces w
      where w.id = provider_connections.workspace_id
        and w.owner_id = auth.uid()
    )
  );

create policy "workspace members can update connections"
  on public.provider_connections for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = provider_connections.workspace_id
        and wm.user_id = auth.uid()
    )
    or
    exists (
      select 1 from public.workspaces w
      where w.id = provider_connections.workspace_id
        and w.owner_id = auth.uid()
    )
  );

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_provider_connections_updated on public.provider_connections;
create trigger on_provider_connections_updated
  before update on public.provider_connections
  for each row execute procedure public.handle_updated_at();