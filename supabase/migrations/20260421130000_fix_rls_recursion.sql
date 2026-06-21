-- Fix 500 errors on organization_data (RLS infinite recursion on organization_members)

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

drop policy if exists "organizations_select_member" on public.organizations;
drop policy if exists "organization_members_select_self" on public.organization_members;
drop policy if exists "organization_members_select_org_peers" on public.organization_members;
drop policy if exists "organization_data_select_member" on public.organization_data;
drop policy if exists "organization_data_insert_member" on public.organization_data;
drop policy if exists "organization_data_update_member" on public.organization_data;

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
