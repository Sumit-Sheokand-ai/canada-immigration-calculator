create extension if not exists pgcrypto;

create table if not exists public.saved_profiles (
  id text primary key,
  name text,
  score integer not null default 0,
  email text,
  alert_opt_in boolean not null default false,
  alert_token text unique,
  profile_json jsonb not null default '{}'::jsonb,
  last_alert_cutoff integer,
  last_alert_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_profiles_alert_idx on public.saved_profiles (alert_opt_in, score);
create index if not exists saved_profiles_email_idx on public.saved_profiles (email);

alter table public.saved_profiles enable row level security;

drop policy if exists "anon_insert_saved_profiles" on public.saved_profiles;
create policy "anon_insert_saved_profiles"
on public.saved_profiles
for insert
to anon
with check (true);

drop policy if exists "anon_update_saved_profiles" on public.saved_profiles;
create policy "anon_update_saved_profiles"
on public.saved_profiles
for update
to anon
using (true)
with check (true);
