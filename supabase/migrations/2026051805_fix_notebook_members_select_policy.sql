-- Fix recursive RLS on notebook_members select policy.
-- The previous policy used an EXISTS query against notebook_members inside a notebook_members policy,
-- which can trigger infinite recursion for authenticated users.

create or replace function public.is_active_notebook_member(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notebook_members nm
    where nm.notebook_owner_id = target_owner_id
      and nm.status = 'active'
      and (
        nm.member_user_id = auth.uid()
        or lower(nm.member_email) = lower(auth.jwt() ->> 'email')
      )
  )
$$;

drop policy if exists "members can read shared notebook members" on public.notebook_members;

create policy "members can read shared notebook members"
on public.notebook_members
for select
to authenticated
using (
  member_user_id = auth.uid()
  or lower(member_email) = lower(auth.jwt() ->> 'email')
  or public.is_active_notebook_member(notebook_owner_id)
);
