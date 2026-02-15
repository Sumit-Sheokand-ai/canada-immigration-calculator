create table if not exists public.question_sets (
  id text not null default 'wizard',
  source text not null default 'baseline',
  version text not null default 'v1',
  is_active boolean not null default true,
  payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, source, version)
);

create index if not exists question_sets_active_idx
  on public.question_sets (id, is_active, updated_at desc);

alter table public.question_sets enable row level security;

drop policy if exists "public_read_question_sets" on public.question_sets;
create policy "public_read_question_sets"
on public.question_sets
for select
to anon, authenticated
using (true);

