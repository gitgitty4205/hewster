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
  activity_type text not null check (activity_type in ('pee', 'poop', 'hike', 'treat', 'food', 'supplement', 'sick', 'other')),
  happened_at timestamptz not null,
  detail text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.activity_logs
  drop constraint if exists activity_logs_activity_type_check;

alter table public.activity_logs
  add constraint activity_logs_activity_type_check
  check (activity_type in ('pee', 'poop', 'hike', 'treat', 'food', 'supplement', 'sick', 'other'));

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

alter table public.meal_templates enable row level security;
alter table public.daily_meals enable row level security;
alter table public.activity_logs enable row level security;
alter table public.weight_logs enable row level security;
alter table public.meal_logs enable row level security;
alter table public.manual_alerts enable row level security;

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
drop policy if exists "public read meal logs" on public.meal_logs;
drop policy if exists "public write meal logs" on public.meal_logs;
drop policy if exists "public read manual alerts" on public.manual_alerts;
drop policy if exists "public write manual alerts" on public.manual_alerts;
drop policy if exists "public update manual alerts" on public.manual_alerts;

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
