-- Phase 6: Parent/Child/Tutor Ecosystem + Integrations
-- Chunk D: Manage Integrations

-- 1) Create calendar_integrations table (if not exists)
-- This is a unified table for all calendar providers (Google, Apple, YouTube)
-- Note: We already have google_calendar_credentials table, but this provides a unified interface
CREATE TABLE IF NOT EXISTS calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','apple','youtube')),
  access_token text, -- For OAuth providers (Google)
  refresh_token text, -- For OAuth providers (Google)
  calendar_id text, -- Specific calendar ID (for Google)
  ics_url text, -- For Apple/iCal: the ICS subscription URL
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (family_id, provider) -- One integration per provider per family
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS calendar_integrations_family_id_idx ON calendar_integrations(family_id);
CREATE INDEX IF NOT EXISTS calendar_integrations_provider_idx ON calendar_integrations(provider);

-- Enable RLS
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;

-- 2) RLS Policies for calendar_integrations
-- Only parents can view/manage integrations
DROP POLICY IF EXISTS "Parents can view family integrations" ON calendar_integrations;
CREATE POLICY "Parents can view family integrations" ON calendar_integrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = calendar_integrations.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = calendar_integrations.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Parents can manage family integrations" ON calendar_integrations;
CREATE POLICY "Parents can manage family integrations" ON calendar_integrations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = calendar_integrations.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = calendar_integrations.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = calendar_integrations.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = calendar_integrations.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  );

-- Service role can read all (for backend)
DROP POLICY IF EXISTS "Service role can read all integrations" ON calendar_integrations;
CREATE POLICY "Service role can read all integrations" ON calendar_integrations
  FOR SELECT
  TO service_role
  USING (true);

-- Migrate existing google_calendar_credentials to calendar_integrations (if any exist)
-- This is optional - we can keep both tables and sync between them
DO $$
BEGIN
  -- Copy existing Google credentials to calendar_integrations
  INSERT INTO calendar_integrations (
    family_id,
    provider,
    access_token,
    refresh_token,
    calendar_id
  )
  SELECT 
    gcc.family_id,
    'google'::text,
    gcc.access_token,
    gcc.refresh_token,
    NULL::text -- calendar_id not stored in google_calendar_credentials
  FROM google_calendar_credentials gcc
  WHERE NOT EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE ci.family_id = gcc.family_id
      AND ci.provider = 'google'
  )
  ON CONFLICT (family_id, provider) DO NOTHING;
END $$;

-- Add comment
COMMENT ON TABLE calendar_integrations IS 'Unified calendar integrations table for Google, Apple, and YouTube';
COMMENT ON COLUMN calendar_integrations.provider IS 'Provider: google, apple, or youtube';
COMMENT ON COLUMN calendar_integrations.access_token IS 'OAuth access token (for Google)';
COMMENT ON COLUMN calendar_integrations.refresh_token IS 'OAuth refresh token (for Google)';
COMMENT ON COLUMN calendar_integrations.calendar_id IS 'Specific calendar ID (for Google)';
COMMENT ON COLUMN calendar_integrations.ics_url IS 'ICS subscription URL (for Apple/iCal)';

