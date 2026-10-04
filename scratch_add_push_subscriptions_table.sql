-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Stores browser Push API subscriptions per user, for the watchlist
-- price-move notification feature. Writes/reads go through the server
-- (service role key) via /api/push/*, so RLS here is defense in depth,
-- matching the pattern used by the other user-data tables.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy "Users can view their own push subscriptions"
  on push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can delete their own push subscriptions"
  on push_subscriptions for delete
  using (auth.uid() = user_id);
