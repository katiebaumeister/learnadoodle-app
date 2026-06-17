-- Placeholder parent/tutor profiles (name + avatar) before an account invite is sent.
-- Mirrors the children table pattern for adults without logins yet.

CREATE TABLE IF NOT EXISTS public.family_guest_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('parent', 'tutor')),
  display_name text NOT NULL,
  avatar_url text,
  child_scope uuid[] DEFAULT '{}',
  tutor_permission_profile text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_guest_members_family_id_idx
  ON public.family_guest_members (family_id);
CREATE INDEX IF NOT EXISTS family_guest_members_role_idx
  ON public.family_guest_members (role);

ALTER TABLE public.family_guest_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents manage family guest members" ON public.family_guest_members;
CREATE POLICY "Parents manage family guest members" ON public.family_guest_members
  FOR ALL
  TO authenticated
  USING (public.is_family_parent(family_id))
  WITH CHECK (public.is_family_parent(family_id));

DROP POLICY IF EXISTS "Service role full access guest members" ON public.family_guest_members;
CREATE POLICY "Service role full access guest members" ON public.family_guest_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_guest_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_guest_members TO service_role;

COMMENT ON TABLE public.family_guest_members IS
  'Family-defined parent/tutor profiles before invite acceptance (name + prof avatar).';

DO $$
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
    ALTER TABLE public.invites
      ADD COLUMN IF NOT EXISTS invited_avatar_url text;
  END IF;
END $$;

COMMENT ON COLUMN public.invites.invited_avatar_url IS
  'Bundled avatar key (prof1–prof10) chosen when the invite was sent.';
