-- Let every active notebook member read the shared daily care logs.
-- Basic care roles can already insert these rows, so their own screen must also be
-- able to load rows written by another invited account.

drop policy if exists "care team read activity logs" on public.activity_logs;
create policy "members read activity logs"
on public.activity_logs
for select
to authenticated
using (public.can_read_notebook(owner_id));

drop policy if exists "care team read meal logs" on public.meal_logs;
create policy "members read meal logs"
on public.meal_logs
for select
to authenticated
using (public.can_read_notebook(owner_id));
