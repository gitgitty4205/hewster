create table if not exists public.pet_profiles (
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_slug text not null,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, profile_slug)
);

create index if not exists pet_profiles_owner_profile_idx
on public.pet_profiles(owner_id, profile_slug);

alter table public.pet_profiles enable row level security;

drop policy if exists "members read pet profiles" on public.pet_profiles;
create policy "members read pet profiles"
on public.pet_profiles
for select
to authenticated
using (public.can_read_notebook(owner_id));

drop policy if exists "owners and co-owners write pet profiles" on public.pet_profiles;
create policy "owners and co-owners write pet profiles"
on public.pet_profiles
for insert
to authenticated
with check (public.can_edit_notebook_entry(owner_id));

drop policy if exists "owners and co-owners update pet profiles" on public.pet_profiles;
create policy "owners and co-owners update pet profiles"
on public.pet_profiles
for update
to authenticated
using (public.can_edit_notebook_entry(owner_id))
with check (public.can_edit_notebook_entry(owner_id));

drop trigger if exists audit_pet_profiles on public.pet_profiles;
create trigger audit_pet_profiles
after insert or update or delete on public.pet_profiles
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug');
