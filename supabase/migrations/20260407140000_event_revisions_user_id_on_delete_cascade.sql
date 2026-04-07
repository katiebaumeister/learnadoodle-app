-- Admin / auth user delete fails with:
--   ERROR: update or delete on table "users" violates foreign key constraint
--   "event_revisions_user_id_fkey" on table "event_revisions" (SQLSTATE 23503)
-- Recreate the FK so deleting an auth user removes dependent revision rows.

ALTER TABLE public.event_revisions
  DROP CONSTRAINT IF EXISTS event_revisions_user_id_fkey;

ALTER TABLE public.event_revisions
  ADD CONSTRAINT event_revisions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT event_revisions_user_id_fkey ON public.event_revisions IS
  'CASCADE: allow auth user deletion (dashboard/admin API) without orphan revision rows blocking.';
