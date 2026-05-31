-- Seed a durable baseline version for any current meal templates that do not
-- already have an insert audit row. Retroactive logging can then reconstruct
-- meal plans from the audit trail instead of relying only on current rows.

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
