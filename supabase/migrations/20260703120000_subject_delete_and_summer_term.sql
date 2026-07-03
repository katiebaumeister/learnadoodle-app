-- Fix subject add/delete failures:
-- 1. Allow summer_term (UI already exposes it; CHECK constraint was stale).
-- 2. Ensure authenticated users can DELETE their family's subjects (RLS).
-- 3. Allow subject delete when grade rows still reference the subject.

ALTER TABLE public.subject
  DROP CONSTRAINT IF EXISTS subject_school_term_allowed_chk;

ALTER TABLE public.subject
  ADD CONSTRAINT subject_school_term_allowed_chk
  CHECK (school_term IN ('full_year', 'fall_term', 'spring_term', 'summer_term'));

DROP POLICY IF EXISTS "Users can delete family subjects" ON public.subject;
CREATE POLICY "Users can delete family subjects" ON public.subject
  FOR DELETE
  USING (public.is_family_member(family_id));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'grades'
  ) AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'grades_subject_id_fkey'
  ) THEN
    ALTER TABLE public.grades DROP CONSTRAINT grades_subject_id_fkey;
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE SET NULL;
  END IF;
END
$$;
