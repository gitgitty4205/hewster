-- Make first-time owner membership creation more reliable from the client.
-- The app already supplies the signed-in user's email; auth.uid() is the important ownership check.

drop policy if exists "users can create own owner membership" on public.notebook_members;

create policy "users can create own owner membership"
on public.notebook_members
for insert
to authenticated
with check (
  notebook_owner_id = auth.uid()
  and member_user_id = auth.uid()
  and role = 'owner'
  and status = 'active'
);
