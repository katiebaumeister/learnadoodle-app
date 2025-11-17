-- Phase 6: Parent/Child/Tutor Ecosystem + Integrations
-- Chunk A: Roles & Membership

-- 1) Extend profiles table with role column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles 
      ADD COLUMN role text
        CHECK (role IN ('parent','child','tutor'))
        DEFAULT 'parent';
    
    -- Add index for role queries
    CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role) WHERE role IS NOT NULL;
  END IF;
END $$;

-- 2) Create family_members table
CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL CHECK (member_role IN ('parent','child','tutor')),
  child_scope uuid[] DEFAULT '{}', -- which children this member can see (for tutors)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (family_id, user_id) -- One membership per user per family
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS family_members_family_id_idx ON family_members(family_id);
CREATE INDEX IF NOT EXISTS family_members_user_id_idx ON family_members(user_id);
CREATE INDEX IF NOT EXISTS family_members_role_idx ON family_members(member_role);

-- Enable RLS
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- 3) RLS Policies for family_members
-- Users can read/update their own family_members row
DROP POLICY IF EXISTS "Users can view own membership" ON family_members;
CREATE POLICY "Users can view own membership" ON family_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own membership" ON family_members;
CREATE POLICY "Users can update own membership" ON family_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can read all (for backend logic)
DROP POLICY IF EXISTS "Service role can read all memberships" ON family_members;
CREATE POLICY "Service role can read all memberships" ON family_members
  FOR SELECT
  TO service_role
  USING (true);

-- Parents can view all memberships in their family
DROP POLICY IF EXISTS "Parents can view family memberships" ON family_members;
CREATE POLICY "Parents can view family memberships" ON family_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_members.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
  );

-- Parents can insert/update memberships in their family
DROP POLICY IF EXISTS "Parents can manage family memberships" ON family_members;
CREATE POLICY "Parents can manage family memberships" ON family_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_members.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_members.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
  );

-- 4) Update is_family_member helper to check family_members table
-- Note: Keep the original signature (_family) for backward compatibility
CREATE OR REPLACE FUNCTION public.is_family_member(_family uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if user is a member via family_members table
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
  )
  -- Fallback: check if user has children in this family (for backward compatibility)
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
  )
  -- Fallback: check if user's children belong to this family
  OR EXISTS (
    SELECT 1
    FROM children c
    JOIN profiles p ON p.family_id = c.family_id
    WHERE c.family_id = _family
      AND p.id = auth.uid()
  );
$$;

-- 5) Create helper function to get accessible children for a user
CREATE OR REPLACE FUNCTION public.get_accessible_children(_user_id uuid)
RETURNS TABLE(child_id uuid, family_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- If user is a parent, return all children in their family
  SELECT DISTINCT c.id AS child_id, c.family_id
  FROM children c
  JOIN family_members fm ON fm.family_id = c.family_id
  WHERE fm.user_id = _user_id
    AND fm.member_role = 'parent'
  
  UNION
  
  -- If user is a tutor, return only children in their child_scope
  SELECT DISTINCT unnest(fm.child_scope) AS child_id, fm.family_id
  FROM family_members fm
  WHERE fm.user_id = _user_id
    AND fm.member_role = 'tutor'
    AND array_length(fm.child_scope, 1) > 0
  
  UNION
  
  -- If user is a child, return only themselves
  SELECT DISTINCT c.id AS child_id, c.family_id
  FROM children c
  JOIN family_members fm ON fm.family_id = c.family_id
  WHERE fm.user_id = _user_id
    AND fm.member_role = 'child'
    AND c.id = ANY(fm.child_scope)
  
  -- Fallback: if no family_members entry, check profiles.family_id (backward compatibility)
  UNION
  SELECT DISTINCT c.id AS child_id, c.family_id
  FROM children c
  JOIN profiles p ON p.family_id = c.family_id
  WHERE p.id = _user_id
    AND NOT EXISTS (
      SELECT 1 FROM family_members fm WHERE fm.user_id = _user_id
    );
$$;

-- 6) Create child_progress view
CREATE OR REPLACE VIEW child_progress AS
SELECT 
  c.id AS child_id,
  c.family_id,
  c.first_name AS child_name,
  s.id AS subject_id,
  s.name AS subject_name,
  -- Completed events count (per subject)
  COUNT(DISTINCT CASE WHEN e.status = 'done' AND e.subject_id = s.id THEN e.id END) AS completed_events,
  -- Total events count (per subject)
  COUNT(DISTINCT CASE WHEN e.subject_id = s.id THEN e.id END) AS total_events,
  -- Attendance minutes (total across all subjects for this child)
  COALESCE((
    SELECT SUM(COALESCE(ar.minutes, 0))
    FROM attendance_records ar
    WHERE ar.child_id = c.id
  ), 0) AS total_attendance_minutes,
  -- Average rating from event_outcomes (per subject)
  ROUND(AVG(CASE WHEN e.subject_id = s.id THEN eo.rating END)::numeric, 2) AS avg_rating,
  -- Latest grade (per subject)
  (SELECT g.grade FROM grades g 
   WHERE g.child_id = c.id 
     AND g.subject_id = s.id 
   ORDER BY g.created_at DESC 
   LIMIT 1) AS latest_grade,
  -- Total credits (per subject)
  COALESCE((
    SELECT SUM(COALESCE(g.credits, 0))
    FROM grades g
    WHERE g.child_id = c.id AND g.subject_id = s.id
  ), 0) AS total_credits,
  -- Portfolio uploads count (per subject)
  COUNT(DISTINCT CASE WHEN u.subject_id = s.id THEN u.id END) AS portfolio_count
FROM children c
CROSS JOIN subject s
LEFT JOIN events e ON e.child_id = c.id
LEFT JOIN event_outcomes eo ON eo.event_id = e.id
LEFT JOIN uploads u ON u.child_id = c.id
GROUP BY c.id, c.family_id, c.first_name, s.id, s.name;

-- Grant access to the view
GRANT SELECT ON child_progress TO authenticated;
GRANT SELECT ON child_progress TO service_role;

-- Add comment
COMMENT ON VIEW child_progress IS 'Aggregated progress metrics per child/subject for dashboards';

