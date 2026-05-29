-- Notebook membership access for Owner / Co-owner / Caretaker / Pet Sitter.
-- Run after 20260518_user_owned_notebook_data.sql.

create table if not exists public.notebook_members (
  id uuid primary key default gen_random_uuid(),
  notebook_owner_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete cascade,
  member_email text not null,
  role text not null check (role in ('owner', 'co-owner', 'caretaker', 'pet-sitter')),
  status text not null default 'invited' check (status in ('active', 'invited', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notebook_owner_id, member_email)
);

create index if not exists notebook_members_member_user_id_idx on public.notebook_members(member_user_id);
create index if not exists notebook_members_member_email_idx on public.notebook_members(lower(member_email));
create index if not exists notebook_members_owner_status_idx on public.notebook_members(notebook_owner_id, status);

alter table public.notebook_members enable row level security;

drop policy if exists "members can read shared notebook members" on public.notebook_members;
drop policy if exists "owners can invite notebook members" on public.notebook_members;
drop policy if exists "owners can update notebook members" on public.notebook_members;
drop policy if exists "users can claim their email invites" on public.notebook_members;
drop policy if exists "users can create own owner membership" on public.notebook_members;

create policy "members can read shared notebook members"
on public.notebook_members
for select
to authenticated
using (
  member_user_id = auth.uid()
  or lower(member_email) = lower(auth.jwt() ->> 'email')
  or exists (
    select 1
    from public.notebook_members viewer
    where viewer.notebook_owner_id = notebook_members.notebook_owner_id
      and viewer.status = 'active'
      and (
        viewer.member_user_id = auth.uid()
        or lower(viewer.member_email) = lower(auth.jwt() ->> 'email')
      )
  )
);

create policy "users can create own owner membership"
on public.notebook_members
for insert
to authenticated
with check (
  notebook_owner_id = auth.uid()
  and member_user_id = auth.uid()
  and role = 'owner'
  and status = 'active'
  and lower(member_email) = lower(auth.jwt() ->> 'email')
);

create policy "owners can invite notebook members"
on public.notebook_members
for insert
to authenticated
with check (
  notebook_owner_id = auth.uid()
  and role in ('co-owner', 'caretaker', 'pet-sitter')
  and status in ('invited', 'active')
);

create policy "owners can update notebook members"
on public.notebook_members
for update
to authenticated
using (
  notebook_owner_id = auth.uid()
  and role <> 'owner'
)
with check (
  notebook_owner_id = auth.uid()
  and role in ('co-owner', 'caretaker', 'pet-sitter')
);

create policy "users can claim their email invites"
on public.notebook_members
for update
to authenticated
using (
  lower(member_email) = lower(auth.jwt() ->> 'email')
  and status = 'invited'
)
with check (
  lower(member_email) = lower(auth.jwt() ->> 'email')
  and member_user_id = auth.uid()
  and status = 'active'
);

-- Replace the single-owner policies with membership-aware policies.
drop policy if exists "owners manage meal templates" on public.meal_templates;
drop policy if exists "owners manage daily meals" on public.daily_meals;
drop policy if exists "owners manage activity logs" on public.activity_logs;
drop policy if exists "owners manage weight logs" on public.weight_logs;
drop policy if exists "owners manage meal logs" on public.meal_logs;
drop policy if exists "owners manage manual alerts" on public.manual_alerts;
drop policy if exists "owners manage care item templates" on public.care_item_templates;

create or replace function public.current_notebook_role(target_owner_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nm.role
  from public.notebook_members nm
  where nm.notebook_owner_id = target_owner_id
    and nm.status = 'active'
    and (
      nm.member_user_id = auth.uid()
      or lower(nm.member_email) = lower(auth.jwt() ->> 'email')
    )
  order by case nm.role
    when 'owner' then 1
    when 'co-owner' then 2
    when 'caretaker' then 3
    when 'pet-sitter' then 4
    else 5
  end
  limit 1
$$;

create or replace function public.can_read_notebook(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner', 'caretaker', 'pet-sitter')
$$;

create or replace function public.can_manage_notebook(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner', 'caretaker')
$$;

create or replace function public.can_log_basic_care(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner', 'caretaker', 'pet-sitter')
$$;

create policy "members read meal templates"
on public.meal_templates
for select
to authenticated
using (public.can_read_notebook(owner_id));

create policy "care team manage meal templates"
on public.meal_templates
for all
to authenticated
using (public.can_manage_notebook(owner_id))
with check (public.can_manage_notebook(owner_id));

create policy "members read daily meals"
on public.daily_meals
for select
to authenticated
using (public.can_read_notebook(owner_id));

create policy "care team update daily meals"
on public.daily_meals
for all
to authenticated
using (public.can_log_basic_care(owner_id))
with check (public.can_log_basic_care(owner_id));

create policy "members read activity logs"
on public.activity_logs
for select
to authenticated
using (public.can_read_notebook(owner_id));

create policy "care team insert activity logs"
on public.activity_logs
for insert
to authenticated
with check (public.can_log_basic_care(owner_id));

create policy "care team update activity logs"
on public.activity_logs
for update
to authenticated
using (public.can_manage_notebook(owner_id))
with check (public.can_manage_notebook(owner_id));

create policy "care team delete activity logs"
on public.activity_logs
for delete
to authenticated
using (public.can_manage_notebook(owner_id));

create policy "care team manage weight logs"
on public.weight_logs
for all
to authenticated
using (public.can_manage_notebook(owner_id))
with check (public.can_manage_notebook(owner_id));

create policy "members read meal logs"
on public.meal_logs
for select
to authenticated
using (public.can_read_notebook(owner_id));

create policy "care team insert meal logs"
on public.meal_logs
for insert
to authenticated
with check (public.can_log_basic_care(owner_id));

create policy "care team delete meal logs"
on public.meal_logs
for delete
to authenticated
using (public.can_manage_notebook(owner_id));

create policy "care team manage manual alerts"
on public.manual_alerts
for all
to authenticated
using (public.can_manage_notebook(owner_id))
with check (public.can_manage_notebook(owner_id));

create policy "care team manage care item templates"
on public.care_item_templates
for all
to authenticated
using (public.can_manage_notebook(owner_id))
with check (public.can_manage_notebook(owner_id));
