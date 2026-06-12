-- Limit each notebook to 10 non-revoked members, including the owner.

create or replace function public.enforce_notebook_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_member_count integer;
begin
  if new.status = 'revoked' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status <> 'revoked' and new.status <> 'revoked' then
    return new;
  end if;

  select count(*)
  into active_member_count
  from public.notebook_members
  where notebook_owner_id = new.notebook_owner_id
    and status <> 'revoked'
    and id <> new.id;

  if active_member_count >= 10 then
    raise exception 'This notebook already has 10 members. Remove someone before inviting another person.';
  end if;

  return new;
end;
$$;

drop trigger if exists notebook_member_limit on public.notebook_members;
create trigger notebook_member_limit
before insert or update of status, notebook_owner_id
on public.notebook_members
for each row
execute function public.enforce_notebook_member_limit();
