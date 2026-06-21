-- Andeco Horizon — workspace data + RLS (run in Supabase SQL Editor or via CLI)
-- After apply: create your first org + membership + data row (see SUPABASE.md).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations & membership (maps to one "company" workspace)
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  allowed_modules text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Single JSON document per org (same shape as andeco_data.json + fleet/crew blobs)
create table if not exists public.organization_data (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists organization_data_updated_at_idx
  on public.organization_data (updated_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security (uses security definer helper to avoid infinite recursion)
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_data enable row level security;

create or replace function public.is_org_member(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = check_org_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (public.is_org_member(id));

create policy "organization_members_select_member"
  on public.organization_members for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "organization_data_select_member"
  on public.organization_data for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "organization_data_insert_member"
  on public.organization_data for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "organization_data_update_member"
  on public.organization_data for update
  to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

comment on table public.organization_data is 'Stores Accounting + Fleet + Crew payload (buildFullPayload shape). HR employees + payroll keys still in browser localStorage until migrated.';
