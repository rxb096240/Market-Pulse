-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Logs each watchlist price-move alert the server fires (same crossings
-- that trigger a push notification), so the in-app bell icon can show a
-- history instead of alerts being purely fire-and-forget. Inserts happen
-- server-side (service role) from checkWatchlistAlerts in server.js;
-- reads/mark-as-read go straight from the client via RLS.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null,
  asset_key text not null,
  sym text not null,
  name text not null,
  direction text not null,
  change_pct numeric not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx on notifications(user_id, created_at desc);

alter table notifications enable row level security;

create policy "Users can view their own notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "Users can mark their own notifications read"
  on notifications for update
  using (auth.uid() = user_id);
