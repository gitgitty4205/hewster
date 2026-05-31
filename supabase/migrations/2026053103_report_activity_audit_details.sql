-- Fetch the optional "Include log details" audit rows for the actual
-- activities included in a report, instead of using the latest rows globally.

create or replace function public.report_activity_audit_log(
  report_owner_id uuid,
  report_profile_slug text,
  report_activity_ids text[],
  report_row_limit integer default 99
)
returns table (
  id bigint,
  table_name text,
  action text,
  occurred_at timestamptz,
  actor_user_id uuid,
  row_pk jsonb,
  old_row jsonb,
  new_row jsonb
)
language sql
stable
as $$
  select
    app_audit_log.id,
    app_audit_log.table_name,
    app_audit_log.action,
    app_audit_log.occurred_at,
    app_audit_log.actor_user_id,
    app_audit_log.row_pk,
    app_audit_log.old_row,
    app_audit_log.new_row
  from public.app_audit_log
  where app_audit_log.owner_id = report_owner_id
    and app_audit_log.profile_slug = report_profile_slug
    and app_audit_log.table_name = 'activity_logs'
    and app_audit_log.action <> 'DELETE'
    and coalesce(
      app_audit_log.row_pk ->> 'id',
      app_audit_log.new_row ->> 'id',
      app_audit_log.old_row ->> 'id'
    ) = any(report_activity_ids)
  order by app_audit_log.occurred_at desc, app_audit_log.id desc
  limit least(greatest(report_row_limit, 0), 99);
$$;
