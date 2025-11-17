-- Phase 6: Parent/Child/Tutor Ecosystem + Integrations
-- Chunk E: Inspire Learning (AI recommendations)

-- 1) Create learning_suggestions table to store AI-generated recommendations
CREATE TABLE IF NOT EXISTS learning_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title text NOT NULL,
  source text NOT NULL, -- e.g., "YouTube", "Khan Academy", "Article"
  type text NOT NULL CHECK (type IN ('video','article','project','course')),
  duration_min integer,
  link text NOT NULL,
  description text,
  approved_by_parent boolean DEFAULT false,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  -- Track which AI generation this came from (optional)
  generation_id uuid,
  UNIQUE (child_id, link) -- Prevent duplicate suggestions
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS learning_suggestions_family_id_idx ON learning_suggestions(family_id);
CREATE INDEX IF NOT EXISTS learning_suggestions_child_id_idx ON learning_suggestions(child_id);
CREATE INDEX IF NOT EXISTS learning_suggestions_approved_idx ON learning_suggestions(child_id, approved_by_parent) WHERE approved_by_parent = true;

-- Enable RLS
ALTER TABLE learning_suggestions ENABLE ROW LEVEL SECURITY;

-- 2) RLS Policies for learning_suggestions
-- Family members can view suggestions for accessible children
DROP POLICY IF EXISTS "Family members can view suggestions" ON learning_suggestions;
CREATE POLICY "Family members can view suggestions" ON learning_suggestions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = learning_suggestions.family_id
        AND fm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = learning_suggestions.family_id
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  );

-- Only parents can approve suggestions
DROP POLICY IF EXISTS "Parents can approve suggestions" ON learning_suggestions;
CREATE POLICY "Parents can approve suggestions" ON learning_suggestions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = learning_suggestions.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = learning_suggestions.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = learning_suggestions.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = learning_suggestions.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  );

-- Service role can read/write all (for backend)
DROP POLICY IF EXISTS "Service role can manage suggestions" ON learning_suggestions;
CREATE POLICY "Service role can manage suggestions" ON learning_suggestions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE learning_suggestions IS 'AI-generated learning recommendations that can be approved by parents for children';
COMMENT ON COLUMN learning_suggestions.approved_by_parent IS 'True if a parent has approved this suggestion for the child to see';
COMMENT ON COLUMN learning_suggestions.generation_id IS 'Optional: track which AI generation batch this suggestion came from';

