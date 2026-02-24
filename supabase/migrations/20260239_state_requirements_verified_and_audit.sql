-- Admin "Mark verified" and versioning/audit for state_requirements

-- Columns for verification tracking
ALTER TABLE state_requirements
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_notes text;

COMMENT ON COLUMN state_requirements.verified_by IS 'Profile ID who last marked this requirement as verified.';
COMMENT ON COLUMN state_requirements.verified_at IS 'When the requirement was last marked verified.';
COMMENT ON COLUMN state_requirements.verification_notes IS 'Optional note when marking verified.';

-- Audit table for change history
CREATE TABLE IF NOT EXISTS state_requirement_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_requirement_id uuid NOT NULL REFERENCES state_requirements(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz DEFAULT now(),
  changed_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_state_requirement_audit_requirement_id ON state_requirement_audit(state_requirement_id);
CREATE INDEX IF NOT EXISTS idx_state_requirement_audit_changed_at ON state_requirement_audit(changed_at);

COMMENT ON TABLE state_requirement_audit IS 'Audit log for state_requirements changes (versioning).';

-- Trigger function
CREATE OR REPLACE FUNCTION state_requirements_audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO state_requirement_audit (state_requirement_id, action, new_data, changed_by)
    VALUES (NEW.id, 'insert', to_jsonb(NEW), current_setting('app.current_user_id', true)::uuid);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO state_requirement_audit (state_requirement_id, action, old_data, new_data, changed_by)
    VALUES (NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), current_setting('app.current_user_id', true)::uuid);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO state_requirement_audit (state_requirement_id, action, old_data, changed_by)
    VALUES (OLD.id, 'delete', to_jsonb(OLD), current_setting('app.current_user_id', true)::uuid);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS state_requirements_audit_trigger ON state_requirements;
CREATE TRIGGER state_requirements_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON state_requirements
  FOR EACH ROW
  EXECUTE PROCEDURE state_requirements_audit_trigger_fn();

-- Allow service_role and authenticated to insert into audit (trigger runs as SECURITY DEFINER)
GRANT SELECT ON state_requirement_audit TO service_role;
GRANT SELECT ON state_requirement_audit TO authenticated;
