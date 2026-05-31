-- Keep destructive history changes owner-only while allowing owners/co-owners to fix past entries.

create or replace function public.can_edit_notebook_entry(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner')
$$;

create or replace function public.can_delete_notebook_entry(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) = 'owner'
$$;

drop policy if exists "care team update activity logs" on public.activity_logs;
create policy "owners and co-owners update activity logs"
on public.activity_logs
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id))
with check (public.can_edit_notebook_entry(owner_id));

drop policy if exists "care team delete activity logs" on public.activity_logs;
create policy "owners delete activity logs"
on public.activity_logs
for delete
to authenticated
using (public.can_delete_notebook_entry(owner_id));

drop policy if exists "care team manage weight logs" on public.weight_logs;
drop policy if exists "members read weight logs" on public.weight_logs;
create policy "members read weight logs"
on public.weight_logs
for select
to authenticated
using (public.can_read_notebook(owner_id));

create policy "care team insert weight logs"
on public.weight_logs
for insert
to authenticated
with check (public.can_log_basic_care(owner_id));

create policy "owners and co-owners update weight logs"
on public.weight_logs
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id))
with check (public.can_edit_notebook_entry(owner_id));

create policy "owners delete weight logs"
on public.weight_logs
for delete
to authenticated
using (public.can_delete_notebook_entry(owner_id));

drop policy if exists "care team update meal logs" on public.meal_logs;
create policy "owners and co-owners update meal logs"
on public.meal_logs
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id))
with check (public.can_edit_notebook_entry(owner_id));

drop policy if exists "care team delete meal logs" on public.meal_logs;
create policy "owners delete meal logs"
on public.meal_logs
for delete
to authenticated
using (public.can_delete_notebook_entry(owner_id));

drop policy if exists "care team update activity attachments" on public.activity_attachments;
create policy "owners and co-owners update activity attachments"
on public.activity_attachments
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id))
with check (public.can_edit_notebook_entry(owner_id));

drop policy if exists "care team delete activity attachments" on public.activity_attachments;
create policy "owners delete activity attachments"
on public.activity_attachments
for delete
to authenticated
using (public.can_delete_notebook_entry(owner_id));

drop policy if exists "care team update pet attachment files" on storage.objects;
create policy "owners and co-owners update pet attachment files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pet-attachments'
  and public.can_edit_notebook_entry(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'pet-attachments'
  and public.can_edit_notebook_entry(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "care team delete pet attachment files" on storage.objects;
create policy "owners delete pet attachment files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pet-attachments'
  and public.can_delete_notebook_entry(((storage.foldername(name))[1])::uuid)
);
