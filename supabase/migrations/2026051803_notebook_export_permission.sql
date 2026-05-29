-- Explicit export permission helper.
-- Only owners and co-owners can export/copy notebook data.

create or replace function public.can_export_notebook(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_notebook_role(target_owner_id) in ('owner', 'co-owner')
$$;
