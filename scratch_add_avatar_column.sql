-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Adds an avatar_key column to practice_accounts so users can pick a preset
-- trading-themed avatar (bull, bear, rocket, etc.) from the auth menu.

alter table practice_accounts add column if not exists avatar_key text;
