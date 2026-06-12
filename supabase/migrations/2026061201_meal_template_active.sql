alter table public.meal_templates
add column if not exists active boolean not null default true;
