create extension if not exists pgcrypto;

create table if not exists public.saved_profiles (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
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

create table if not exists public.draw_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ircc_json',
  last_updated date not null,
  average_cutoff integer not null,
  payload jsonb not null default '{}'::jsonb,
  checksum text,
  created_at timestamptz not null default now()
);

create table if not exists public.draw_update_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ircc_json',
  status text not null default 'started',
  message text,
  rows_parsed integer not null default 0,
  snapshot_id uuid references public.draw_snapshots(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.saved_profiles add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists saved_profiles_alert_idx on public.saved_profiles (alert_opt_in, score);
create index if not exists saved_profiles_email_idx on public.saved_profiles (email);
create index if not exists saved_profiles_user_idx on public.saved_profiles (user_id);

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

drop policy if exists "auth_select_own_saved_profiles" on public.saved_profiles;
create policy "auth_select_own_saved_profiles"
on public.saved_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "auth_insert_own_saved_profiles" on public.saved_profiles;
create policy "auth_insert_own_saved_profiles"
on public.saved_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "auth_update_own_saved_profiles" on public.saved_profiles;
create policy "auth_update_own_saved_profiles"
on public.saved_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.user_tracking_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive',
  plan_name text not null default 'tracking_pro',
  amount_cad numeric(10,2) not null default 5.00,
  billing_period text not null default 'month',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Compatibility table for Stripe/webhook flows that reference public.payments.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_event_id text unique,
  stripe_checkout_session_id text,
  stripe_customer_id text,
  customer_email text,
  stripe_subscription_id text,
  amount_cad numeric(10,2),
  currency text not null default 'cad',
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payments add column if not exists customer_email text;

create table if not exists public.user_path_tracking (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  path_id text,
  target_score integer not null default 0,
  start_score integer not null default 0,
  current_score integer not null default 0,
  status text not null default 'active',
  progress_pct integer not null default 0,
  next_check_in_at timestamptz,
  milestones_json jsonb not null default '[]'::jsonb,
  plan_json jsonb not null default '{}'::jsonb,
  notes_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_tracking_access_status_idx on public.user_tracking_access (status, current_period_end);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_subscription_idx on public.payments (stripe_subscription_id);
create index if not exists user_path_tracking_user_idx on public.user_path_tracking (user_id, updated_at desc);
create unique index if not exists draw_snapshots_source_date_uq on public.draw_snapshots (source, last_updated);
create index if not exists draw_snapshots_updated_idx on public.draw_snapshots (last_updated desc);
create index if not exists draw_update_runs_started_idx on public.draw_update_runs (started_at desc);

alter table public.user_tracking_access enable row level security;
alter table public.payments enable row level security;
alter table public.user_path_tracking enable row level security;
alter table public.draw_snapshots enable row level security;
alter table public.draw_update_runs enable row level security;

drop policy if exists "auth_select_own_tracking_access" on public.user_tracking_access;
create policy "auth_select_own_tracking_access"
on public.user_tracking_access
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "auth_insert_own_tracking_access" on public.user_tracking_access;
create policy "auth_insert_own_tracking_access"
on public.user_tracking_access
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "auth_update_own_tracking_access" on public.user_tracking_access;
create policy "auth_update_own_tracking_access"
on public.user_tracking_access
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
drop policy if exists "auth_select_own_payments" on public.payments;
create policy "auth_select_own_payments"
on public.payments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "auth_insert_own_payments" on public.payments;
create policy "auth_insert_own_payments"
on public.payments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "auth_update_own_payments" on public.payments;
create policy "auth_update_own_payments"
on public.payments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "auth_select_own_path_tracking" on public.user_path_tracking;
create policy "auth_select_own_path_tracking"
on public.user_path_tracking
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "auth_insert_own_path_tracking" on public.user_path_tracking;
create policy "auth_insert_own_path_tracking"
on public.user_path_tracking
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "auth_update_own_path_tracking" on public.user_path_tracking;
create policy "auth_update_own_path_tracking"
on public.user_path_tracking
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "public_read_draw_snapshots" on public.draw_snapshots;
create policy "public_read_draw_snapshots"
on public.draw_snapshots
for select
to anon, authenticated
using (true);
