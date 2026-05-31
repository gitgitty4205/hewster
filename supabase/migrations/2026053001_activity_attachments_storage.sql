-- Real document storage for vet visit attachments.
-- Files live in the private `pet-attachments` bucket under:
--   {notebook_owner_id}/{profile_slug}/{activity_log_id}/{attachment_id}-{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pet-attachments',
  'pet-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.activity_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_slug text not null,
  activity_log_id text not null references public.activity_logs(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  content_type text,
  size_bytes bigint,
  document_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists activity_attachments_owner_profile_idx
on public.activity_attachments(owner_id, profile_slug);

create index if not exists activity_attachments_activity_log_id_idx
on public.activity_attachments(activity_log_id);

alter table public.activity_attachments enable row level security;

drop policy if exists "members read activity attachments" on public.activity_attachments;
create policy "members read activity attachments"
on public.activity_attachments
for select
to authenticated
using (public.can_read_notebook(owner_id));

drop policy if exists "care team insert activity attachments" on public.activity_attachments;
create policy "care team insert activity attachments"
on public.activity_attachments
for insert
to authenticated
with check (public.can_manage_notebook(owner_id));

drop policy if exists "care team update activity attachments" on public.activity_attachments;
create policy "care team update activity attachments"
on public.activity_attachments
for update
to authenticated
using (public.can_manage_notebook(owner_id))
with check (public.can_manage_notebook(owner_id));

drop policy if exists "care team delete activity attachments" on public.activity_attachments;
create policy "care team delete activity attachments"
on public.activity_attachments
for delete
to authenticated
using (public.can_manage_notebook(owner_id));

drop policy if exists "members read pet attachment files" on storage.objects;
create policy "members read pet attachment files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pet-attachments'
  and public.can_read_notebook(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "care team upload pet attachment files" on storage.objects;
create policy "care team upload pet attachment files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pet-attachments'
  and public.can_manage_notebook(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "care team update pet attachment files" on storage.objects;
create policy "care team update pet attachment files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pet-attachments'
  and public.can_manage_notebook(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'pet-attachments'
  and public.can_manage_notebook(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "care team delete pet attachment files" on storage.objects;
create policy "care team delete pet attachment files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pet-attachments'
  and public.can_manage_notebook(((storage.foldername(name))[1])::uuid)
);

drop trigger if exists audit_activity_attachments on public.activity_attachments;
create trigger audit_activity_attachments
after insert or update or delete on public.activity_attachments
for each row execute function public.audit_notebook_row_change('owner_id', 'profile_slug', 'id');
