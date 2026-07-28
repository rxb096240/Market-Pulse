-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Adds a nickname column to practice_accounts for the upcoming paper-trading
-- leaderboard, so it can show a chosen display name instead of raw email.

alter table practice_accounts add column if not exists nickname text;
