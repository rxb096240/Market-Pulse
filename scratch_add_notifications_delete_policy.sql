-- Run once in Supabase SQL Editor (Project -> SQL Editor -> New query).
-- The notifications table (scratch_add_notifications_table.sql) only had
-- select/update RLS policies -- adds delete so the bell's per-item "x" and
-- "Clear all" can remove rows directly via supabaseClient.

create policy "Users can delete their own notifications"
  on notifications for delete
  using (auth.uid() = user_id);
