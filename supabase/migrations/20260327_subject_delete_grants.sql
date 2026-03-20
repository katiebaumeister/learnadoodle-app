-- Allow authenticated users to delete rows required for "delete subject" flow.
-- The app deletes in order: events (by subject_id), materials (by subject_id),
-- syllabus_sections (by syllabus_id), syllabi (by subject_id), then subject.
-- subject already has GRANT DELETE TO authenticated (20260231_subject_table_grants).

-- Events: allow authenticated to DELETE (for subject cascade from Edit Subject / FamilyPanel)
GRANT DELETE ON events TO authenticated;

-- Materials: RLS policy family_delete_own_materials already allows DELETE by family;
-- grant table-level DELETE so the policy can be applied.
GRANT DELETE ON materials TO authenticated;

-- Syllabi and syllabus_sections: allow authenticated to DELETE when removing a subject
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'syllabi') THEN
    EXECUTE 'GRANT DELETE ON syllabi TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'syllabus_sections') THEN
    EXECUTE 'GRANT DELETE ON syllabus_sections TO authenticated';
  END IF;
END $$;
