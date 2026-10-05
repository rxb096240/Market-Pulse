-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Stores user feedback/suggestions/bug reports/feature requests submitted
-- from the "Feedback" nav item. Anonymous submission is allowed (user_id is
-- nullable), so writes go through POST /api/feedback (service role) rather
-- than a direct client insert -- there's no auth.uid() to scope an RLS
-- policy to for a signed-out visitor. RLS is enabled with no policies, so
-- no client can read or write this table directly either way; the planned
-- admin view will also go through a server endpoint, not direct client reads.

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  type text not null check (type in ('suggestion', 'bug', 'feature')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on feedback(created_at desc);

alter table feedback enable row level security;
