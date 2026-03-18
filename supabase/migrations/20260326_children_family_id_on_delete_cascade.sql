-- Deleting a family row should remove children (account delete, etc.).
-- Safe if table exists; skips if constraint name differs (run manually if needed).

DO $$
BEGIN
  IF to_regclass('public.children') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE children
    DROP CONSTRAINT IF EXISTS children_family_id_fkey;
  ALTER TABLE children
    ADD CONSTRAINT children_family_id_fkey
    FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- constraint name different; backend deletes children before family
END $$;
