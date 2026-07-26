-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Adds an email column to the three practice-mode tables and backfills it
-- from auth.users for existing rows, so the Supabase table editor shows
-- who each row belongs to without a join.

alter table practice_accounts add column if not exists email text;
alter table practice_holdings add column if not exists email text;
alter table practice_transactions add column if not exists email text;

update practice_accounts a
set email = u.email
from auth.users u
where a.user_id = u.id and a.email is null;

update practice_holdings h
set email = u.email
from auth.users u
where h.user_id = u.id and h.email is null;

update practice_transactions t
set email = u.email
from auth.users u
where t.user_id = u.id and t.email is null;
