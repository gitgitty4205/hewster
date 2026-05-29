alter table public.manual_alerts
  add column if not exists scope text default 'today',
  add column if not exists weekdays integer[],
  add column if not exists time text,
  add column if not exists created_day_key text;

update public.manual_alerts
set scope = coalesce(scope, 'today')
where scope is null;
