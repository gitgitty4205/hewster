create table if not exists public.meal_templates (
  profile_slug text not null,
  meal_id bigint not null,
  name text not null,
  planned_time text not null,
  food text not null,
  notes text not null default '',
  reminder_offset text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_slug, meal_id)
);

create table if not exists public.daily_meals (
  profile_slug text not null,
  day_key text not null,
  meal_id bigint not null,
  actual_time text,
  status text not null check (status in ('done', 'upcoming', 'late')),
  fed_notes text,
  updated_at timestamptz not null default now(),
  primary key (profile_slug, day_key, meal_id)
);

create table if not exists public.activity_logs (
  id text not null primary key,
  profile_slug text not null,
  activity_type text not null check (activity_type in ('potty', 'pee', 'poop', 'activity', 'outdoor', 'care', 'wellness', 'hike', 'treat', 'food', 'supplement', 'medication', 'sick', 'other')),
  happened_at timestamptz not null,
  detail text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.activity_logs
  drop constraint if exists activity_logs_activity_type_check;

alter table public.activity_logs
  add constraint activity_logs_activity_type_check
  check (activity_type in ('potty', 'pee', 'poop', 'activity', 'outdoor', 'care', 'wellness', 'hike', 'treat', 'food', 'supplement', 'medication', 'sick', 'other'));

create table if not exists public.weight_logs (
  id text not null primary key,
  profile_slug text not null,
  log_date date not null,
  weight text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_logs (
  id text not null primary key,
  profile_slug text not null,
  day_key text not null,
  meal_id bigint not null,
  meal_name text not null,
  food text not null,
  default_notes text not null default '',
  fed_notes text,
  actual_time text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_alerts (
  id text not null primary key,
  profile_slug text not null,
  title text not null,
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.care_item_templates (
  profile_slug text not null,
  kind text not null check (kind in ('supplement', 'medication')),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_slug, kind)
);

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

create policy "public read meal templates"
on public.meal_templates
for select
to public
using (true);

create policy "public write meal templates"
on public.meal_templates
for insert
to public
with check (true);

create policy "public update meal templates"
on public.meal_templates
for update
to public
using (true)
with check (true);

create policy "public read daily meals"
on public.daily_meals
for select
to public
using (true);

create policy "public write daily meals"
on public.daily_meals
for insert
to public
with check (true);

create policy "public update daily meals"
on public.daily_meals
for update
to public
using (true)
with check (true);

create policy "public read activity logs"
on public.activity_logs
for select
to public
using (true);

create policy "public write activity logs"
on public.activity_logs
for insert
to public
with check (true);

create policy "public update activity logs"
on public.activity_logs
for update
to public
using (true)
with check (true);

create policy "public delete activity logs"
on public.activity_logs
for delete
to public
using (true);

create policy "public read weight logs"
on public.weight_logs
for select
to public
using (true);

create policy "public write weight logs"
on public.weight_logs
for insert
to public
with check (true);

create policy "public update weight logs"
on public.weight_logs
for update
to public
using (true)
with check (true);

create policy "public delete weight logs"
on public.weight_logs
for delete
to public
using (true);

create policy "public read meal logs"
on public.meal_logs
for select
to public
using (true);

create policy "public write meal logs"
on public.meal_logs
for insert
to public
with check (true);

create policy "public delete meal logs"
on public.meal_logs
for delete
to public
using (true);

create policy "public read manual alerts"
on public.manual_alerts
for select
to public
using (true);

create policy "public write manual alerts"
on public.manual_alerts
for insert
to public
with check (true);

create policy "public update manual alerts"
on public.manual_alerts
for update
to public
using (true)
with check (true);

create policy "public read care item templates"
on public.care_item_templates
for select
to public
using (true);

create policy "public write care item templates"
on public.care_item_templates
for insert
to public
with check (true);

create policy "public update care item templates"
on public.care_item_templates
for update
to public
using (true)
with check (true);

create table if not exists public.app_audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  table_name text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid default auth.uid(),
  owner_id uuid,
  profile_slug text,
  row_pk jsonb not null default '{}'::jsonb,
  old_row jsonb,
  new_row jsonb
);

create index if not exists app_audit_log_occurred_at_idx on public.app_audit_log(occurred_at desc);
create index if not exists app_audit_log_table_name_idx on public.app_audit_log(table_name);
create index if not exists app_audit_log_owner_occurred_idx on public.app_audit_log(owner_id, occurred_at desc);
create index if not exists app_audit_log_profile_occurred_idx on public.app_audit_log(profile_slug, occurred_at desc);
create index if not exists app_audit_log_row_pk_idx on public.app_audit_log using gin(row_pk);

alter table public.app_audit_log enable row level security;

create or replace function public.audit_notebook_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_data jsonb;
  new_data jsonb;
  row_data jsonb;
  pk_data jsonb := '{}'::jsonb;
  pk_column text;
begin
  old_data := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end;
  new_data := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end;
  row_data := coalesce(new_data, old_data);

  foreach pk_column in array TG_ARGV loop
    pk_data := pk_data || jsonb_build_object(pk_column, row_data -> pk_column);
  end loop;

  insert into public.app_audit_log (
    table_name,
    action,
    actor_user_id,
    owner_id,
    profile_slug,
    row_pk,
    old_row,
    new_row
  )
  values (
    TG_TABLE_NAME,
    TG_OP,
    auth.uid(),
    nullif(row_data ->> 'owner_id', '')::uuid,
    row_data ->> 'profile_slug',
    pk_data,
    old_data,
    new_data
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_meal_templates on public.meal_templates;
create trigger audit_meal_templates
after insert or update or delete on public.meal_templates
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'meal_id');

drop trigger if exists audit_daily_meals on public.daily_meals;
create trigger audit_daily_meals
after insert or update or delete on public.daily_meals
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'day_key', 'meal_id');

drop trigger if exists audit_activity_logs on public.activity_logs;
create trigger audit_activity_logs
after insert or update or delete on public.activity_logs
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'id');

drop trigger if exists audit_weight_logs on public.weight_logs;
create trigger audit_weight_logs
after insert or update or delete on public.weight_logs
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'id');

drop trigger if exists audit_meal_logs on public.meal_logs;
create trigger audit_meal_logs
after insert or update or delete on public.meal_logs
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'id');

drop trigger if exists audit_manual_alerts on public.manual_alerts;
create trigger audit_manual_alerts
after insert or update or delete on public.manual_alerts
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'id');

drop trigger if exists audit_care_item_templates on public.care_item_templates;
create trigger audit_care_item_templates
after insert or update or delete on public.care_item_templates
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'kind');

insert into public.app_audit_log (
  occurred_at,
  table_name,
  action,
  actor_user_id,
  owner_id,
  profile_slug,
  row_pk,
  old_row,
  new_row
)
select
  '1970-01-01 00:00:00+00'::timestamptz,
  'meal_templates',
  'INSERT',
  null,
  meal_templates.owner_id,
  meal_templates.profile_slug,
  jsonb_build_object(
    'owner_id', to_jsonb(meal_templates.owner_id),
    'profile_slug', to_jsonb(meal_templates.profile_slug),
    'meal_id', to_jsonb(meal_templates.meal_id)
  ),
  null,
  to_jsonb(meal_templates)
from public.meal_templates
where not exists (
  select 1
  from public.app_audit_log
  where app_audit_log.table_name = 'meal_templates'
    and app_audit_log.action = 'INSERT'
    and app_audit_log.owner_id = meal_templates.owner_id
    and app_audit_log.profile_slug = meal_templates.profile_slug
    and app_audit_log.row_pk ->> 'meal_id' = meal_templates.meal_id::text
);
