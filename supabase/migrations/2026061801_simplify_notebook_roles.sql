-- Simplify notebook access to Owner / Co-owner / Caretaker.
-- Legacy pet-sitter rows become caretaker rows.

update public.notebook_members
set role = 'caretaker', updated_at = now()
where role = 'pet-sitter';

alter table public.notebook_members
  drop constraint if exists notebook_members_role_check;

alter table public.notebook_members
  add constraint notebook_members_role_check
  check (role in ('owner', 'co-owner', 'caretaker'));

create or replace function public.current_notebook_role(target_owner_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when nm.role = 'pet-sitter' then 'caretaker' else nm.role end
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
    when 'pet-sitter' then 3
    else 5
  end
  limit 1
$$;

create or replace function public.can_manage_notebook(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner')
$$;

create or replace function public.can_use_notebook_attachments(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner')
$$;

create or replace function public.can_read_notebook_activity(
  target_owner_id uuid,
  target_activity_type text,
  target_detail text,
  target_happened_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_notebook_role(target_owner_id) in ('owner', 'co-owner') then true
    when public.current_notebook_role(target_owner_id) = 'caretaker' then
      target_happened_at >= now() - interval '30 days'
      and target_activity_type not in ('sick', 'medication')
      and not (
        target_activity_type = 'wellness'
        and coalesce(target_detail, '') ~* '(Vet Visit|Wellness Exam|Sick Consult|Vaccine|Injection|Lab / Test|Procedure|Medication|Flea & Tick|Deworming|Other Health|Other Vet|Other Medical)'
      )
    else false
  end
$$;

create or replace function public.can_edit_notebook_entry(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner')
$$;

create or replace function public.can_edit_notebook_entry(
  target_owner_id uuid,
  target_table_name text,
  target_entry_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_notebook_role(target_owner_id) in ('owner', 'co-owner')
    or (
      public.current_notebook_role(target_owner_id) = 'caretaker'
      and exists (
        select 1
        from public.app_audit_log audit
        where audit.owner_id = target_owner_id
          and audit.table_name = target_table_name
          and audit.action = 'INSERT'
          and audit.actor_user_id = auth.uid()
          and audit.occurred_at >= now() - interval '24 hours'
          and coalesce(audit.row_pk ->> 'id', audit.new_row ->> 'id') = target_entry_id
      )
    )
$$;

drop policy if exists "members read activity logs" on public.activity_logs;
create policy "members read activity logs"
on public.activity_logs
for select
to authenticated
using (public.can_read_notebook_activity(owner_id, activity_type, detail, happened_at));

drop policy if exists "members read meal logs" on public.meal_logs;
create policy "members read meal logs"
on public.meal_logs
for select
to authenticated
using (
  public.current_notebook_role(owner_id) in ('owner', 'co-owner')
  or (
    public.current_notebook_role(owner_id) = 'caretaker'
    and day_key >= to_char((current_date - interval '30 days')::date, 'YYYY-MM-DD')
  )
);

drop policy if exists "members read weight logs" on public.weight_logs;
create policy "members read weight logs"
on public.weight_logs
for select
to authenticated
using (
  public.current_notebook_role(owner_id) in ('owner', 'co-owner')
  or (
    public.current_notebook_role(owner_id) = 'caretaker'
    and log_date >= (current_date - interval '30 days')::date
  )
);

drop policy if exists "owners and co-owners update activity logs" on public.activity_logs;
create policy "care team update activity logs"
on public.activity_logs
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id, 'activity_logs', id::text))
with check (public.can_edit_notebook_entry(owner_id, 'activity_logs', id::text));

drop policy if exists "owners and co-owners update weight logs" on public.weight_logs;
create policy "care team update weight logs"
on public.weight_logs
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id, 'weight_logs', id::text))
with check (public.can_edit_notebook_entry(owner_id, 'weight_logs', id::text));

drop policy if exists "owners and co-owners update meal logs" on public.meal_logs;
create policy "care team update meal logs"
on public.meal_logs
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id, 'meal_logs', id::text))
with check (public.can_edit_notebook_entry(owner_id, 'meal_logs', id::text));

drop policy if exists "members read activity attachments" on public.activity_attachments;
create policy "owners and co-owners read activity attachments"
on public.activity_attachments
for select
to authenticated
using (public.can_use_notebook_attachments(owner_id));

drop policy if exists "care team insert activity attachments" on public.activity_attachments;
create policy "owners and co-owners insert activity attachments"
on public.activity_attachments
for insert
to authenticated
with check (public.can_use_notebook_attachments(owner_id));

drop policy if exists "owners and co-owners update activity attachments" on public.activity_attachments;
create policy "owners and co-owners update activity attachments"
on public.activity_attachments
for update
to authenticated
using (public.can_use_notebook_attachments(owner_id))
with check (public.can_use_notebook_attachments(owner_id));

drop policy if exists "members read pet attachment files" on storage.objects;
create policy "owners and co-owners read pet attachment files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pet-attachments'
  and public.can_use_notebook_attachments(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "care team upload pet attachment files" on storage.objects;
create policy "owners and co-owners upload pet attachment files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pet-attachments'
  and public.can_use_notebook_attachments(((storage.foldername(name))[1])::uuid)
);
