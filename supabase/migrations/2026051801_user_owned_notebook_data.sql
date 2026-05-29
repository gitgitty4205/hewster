-- User-owned Pet Notebook data.
-- Run this after Supabase Auth is working.
-- It adds owner_id to each existing app table and replaces public RLS with private per-user policies.

alter table public.meal_templates add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.daily_meals add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.activity_logs add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.weight_logs add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.meal_logs add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.manual_alerts add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.care_item_templates add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.meal_templates alter column owner_id set default auth.uid();
alter table public.daily_meals alter column owner_id set default auth.uid();
alter table public.activity_logs alter column owner_id set default auth.uid();
alter table public.weight_logs alter column owner_id set default auth.uid();
alter table public.meal_logs alter column owner_id set default auth.uid();
alter table public.manual_alerts alter column owner_id set default auth.uid();
alter table public.care_item_templates alter column owner_id set default auth.uid();

-- Existing shared rows are assigned to the first auth user so the current Hewie data stays visible.
-- This project currently has the owner account created before invited accounts.
do $$
declare
  first_owner_id uuid;
begin
  select id into first_owner_id
  from auth.users
  order by created_at asc
  limit 1;

  if first_owner_id is null then
    raise exception 'Cannot assign notebook data: no auth.users rows found.';
  end if;

  update public.meal_templates set owner_id = first_owner_id where owner_id is null;
  update public.daily_meals set owner_id = first_owner_id where owner_id is null;
  update public.activity_logs set owner_id = first_owner_id where owner_id is null;
  update public.weight_logs set owner_id = first_owner_id where owner_id is null;
  update public.meal_logs set owner_id = first_owner_id where owner_id is null;
  update public.manual_alerts set owner_id = first_owner_id where owner_id is null;
  update public.care_item_templates set owner_id = first_owner_id where owner_id is null;
end $$;

alter table public.meal_templates alter column owner_id set not null;
alter table public.daily_meals alter column owner_id set not null;
alter table public.activity_logs alter column owner_id set not null;
alter table public.weight_logs alter column owner_id set not null;
alter table public.meal_logs alter column owner_id set not null;
alter table public.manual_alerts alter column owner_id set not null;
alter table public.care_item_templates alter column owner_id set not null;

alter table public.meal_templates drop constraint if exists meal_templates_pkey;
alter table public.meal_templates add primary key (owner_id, profile_slug, meal_id);

alter table public.daily_meals drop constraint if exists daily_meals_pkey;
alter table public.daily_meals add primary key (owner_id, profile_slug, day_key, meal_id);

alter table public.care_item_templates drop constraint if exists care_item_templates_pkey;
alter table public.care_item_templates add primary key (owner_id, profile_slug, kind);

alter table public.meal_templates enable row level security;
alter table public.daily_meals enable row level security;
alter table public.activity_logs enable row level security;
alter table public.weight_logs enable row level security;
alter table public.meal_logs enable row level security;
alter table public.manual_alerts enable row level security;
alter table public.care_item_templates enable row level security;

drop policy if exists "public read meal templates" on public.meal_templates;
drop policy if exists "public write meal templates" on public.meal_templates;
drop policy if exists "public update meal templates" on public.meal_templates;
drop policy if exists "public read daily meals" on public.daily_meals;
drop policy if exists "public write daily meals" on public.daily_meals;
drop policy if exists "public update daily meals" on public.daily_meals;
drop policy if exists "public read activity logs" on public.activity_logs;
drop policy if exists "public write activity logs" on public.activity_logs;
drop policy if exists "public update activity logs" on public.activity_logs;
drop policy if exists "public delete activity logs" on public.activity_logs;
drop policy if exists "public read weight logs" on public.weight_logs;
drop policy if exists "public write weight logs" on public.weight_logs;
drop policy if exists "public update weight logs" on public.weight_logs;
drop policy if exists "public delete weight logs" on public.weight_logs;
drop policy if exists "public read meal logs" on public.meal_logs;
drop policy if exists "public write meal logs" on public.meal_logs;
drop policy if exists "public delete meal logs" on public.meal_logs;
drop policy if exists "public read manual alerts" on public.manual_alerts;
drop policy if exists "public write manual alerts" on public.manual_alerts;
drop policy if exists "public update manual alerts" on public.manual_alerts;
drop policy if exists "public read care item templates" on public.care_item_templates;
drop policy if exists "public write care item templates" on public.care_item_templates;
drop policy if exists "public update care item templates" on public.care_item_templates;

drop policy if exists "owners manage meal templates" on public.meal_templates;
drop policy if exists "owners manage daily meals" on public.daily_meals;
drop policy if exists "owners manage activity logs" on public.activity_logs;
drop policy if exists "owners manage weight logs" on public.weight_logs;
drop policy if exists "owners manage meal logs" on public.meal_logs;
drop policy if exists "owners manage manual alerts" on public.manual_alerts;
drop policy if exists "owners manage care item templates" on public.care_item_templates;

create policy "owners manage meal templates"
on public.meal_templates
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners manage daily meals"
on public.daily_meals
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners manage activity logs"
on public.activity_logs
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners manage weight logs"
on public.weight_logs
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners manage meal logs"
on public.meal_logs
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners manage manual alerts"
on public.manual_alerts
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners manage care item templates"
on public.care_item_templates
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
