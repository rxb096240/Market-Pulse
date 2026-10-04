-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Persists the "armed/disarmed" state checkWatchlistAlerts (server.js) uses
-- to avoid re-notifying the same +/-5% crossing repeatedly. This used to
-- live in an in-memory Map, which reset on every server restart/redeploy --
-- any symbol still past threshold at that moment would immediately re-fire.
-- Persisting it here means a redeploy no longer causes duplicate alerts.
--
-- Server-only table (service role reads/writes it from checkWatchlistAlerts);
-- RLS is enabled with no policies, so no client (including an authenticated
-- user's own requests) can read or write it directly.

create table if not exists alert_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null,
  asset_key text not null,
  armed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, asset_type, asset_key)
);

alter table alert_state enable row level security;
