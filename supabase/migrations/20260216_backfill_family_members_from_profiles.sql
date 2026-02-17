-- Backfill family_members from profiles so existing users have a row.
-- This prevents 500/empty when the app queries family_members for session role.
-- Run after 20250128_recreate_family_members_table.sql (or 20260211_ensure_role_based_access_setup.sql).
-- New rows get member_role 'parent'; update from profiles.role in a follow-up if needed.

INSERT INTO family_members (family_id, user_id, member_role)
SELECT p.family_id, p.id, 'parent'
FROM profiles p
WHERE p.family_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.family_id = p.family_id AND fm.user_id = p.id
  )
ON CONFLICT (family_id, user_id) DO NOTHING;
