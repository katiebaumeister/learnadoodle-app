-- Deleting a user in the Supabase dashboard only removes auth.users.
-- Family, school-year, and profile rows stay behind and are keyed by user id.
-- This runs on that delete so a new signup with the same email starts clean.

CREATE OR REPLACE FUNCTION public.cleanup_signup_confirmation_sent_on_auth_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family uuid;
  v_role text;
BEGIN
  SELECT p.family_id, lower(coalesce(p.role, ''))
    INTO v_family, v_role
  FROM public.profiles p
  WHERE p.id = OLD.id;

  IF v_family IS NOT NULL AND v_role IN ('parent', 'admin', 'owner') THEN
    BEGIN
      DELETE FROM public.family_planner_settings WHERE family_id = v_family;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      DELETE FROM public.children WHERE family_id = v_family;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      DELETE FROM public.family WHERE id = v_family;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  BEGIN
    DELETE FROM public.family_members WHERE user_id = OLD.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.profiles WHERE id = OLD.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF OLD.email IS NOT NULL THEN
    BEGIN
      DELETE FROM public.signup_confirmation_sent
      WHERE email = lower(trim(OLD.email));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.cleanup_signup_confirmation_sent_on_auth_user_delete IS
  'On auth user delete, remove that user id''s profile and, for a parent, the family and school-year rows. Also clears the email-keyed signup confirmation row.';
