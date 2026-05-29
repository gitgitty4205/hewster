-- Audit trail for notebook data changes.
-- This records row-level inserts, updates, and deletes so future data loss can be traced.

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

drop policy if exists "care team read audit log" on public.app_audit_log;

create policy "care team read audit log"
on public.app_audit_log
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.can_manage_notebook(owner_id)
);

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
