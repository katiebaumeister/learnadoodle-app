-- Continue Learning Deep Linking
-- Tracks resume points for courses to enable deep linking and cross-device sync

-- 1) course_resume_points table
CREATE TABLE IF NOT EXISTS course_resume_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  course_id uuid NOT NULL, -- Can reference external_courses.id or family_youtube_items.id
  course_type text NOT NULL CHECK (course_type IN ('youtube', 'khan_academy', 'coursera', 'general', 'external')),
  last_lesson_id uuid, -- external_lesson_id, family_youtube_lesson_id, or lesson ordinal
  last_position_seconds integer, -- For video timestamps (YouTube)
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  progress_percentage numeric(5,2) CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, course_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS course_resume_points_child_id_idx ON course_resume_points(child_id);
CREATE INDEX IF NOT EXISTS course_resume_points_course_id_idx ON course_resume_points(course_id);
CREATE INDEX IF NOT EXISTS course_resume_points_family_id_idx ON course_resume_points(family_id);
CREATE INDEX IF NOT EXISTS course_resume_points_last_viewed_idx ON course_resume_points(last_viewed_at DESC);

-- Enable RLS
ALTER TABLE course_resume_points ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS family_read_own_resume_points ON course_resume_points;
CREATE POLICY family_read_own_resume_points
ON course_resume_points
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_resume_points ON course_resume_points;
CREATE POLICY family_insert_own_resume_points
ON course_resume_points
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_resume_points ON course_resume_points;
CREATE POLICY family_update_own_resume_points
ON course_resume_points
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_resume_points ON course_resume_points;
CREATE POLICY family_delete_own_resume_points
ON course_resume_points
FOR DELETE
USING (is_family_member(family_id));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON course_resume_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON course_resume_points TO service_role;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_course_resume_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS course_resume_points_updated_at ON course_resume_points;
CREATE TRIGGER course_resume_points_updated_at
BEFORE UPDATE ON course_resume_points
FOR EACH ROW
EXECUTE FUNCTION update_course_resume_points_updated_at();

-- Function to get resume point for a course
CREATE OR REPLACE FUNCTION get_course_resume_point(
  _child_id uuid,
  _course_id uuid
)
RETURNS TABLE (
  lesson_id uuid,
  position_seconds integer,
  progress_percentage numeric,
  last_viewed_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    crp.last_lesson_id,
    crp.last_position_seconds,
    crp.progress_percentage,
    crp.last_viewed_at
  FROM course_resume_points crp
  WHERE crp.child_id = _child_id
    AND crp.course_id = _course_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_course_resume_point(uuid, uuid) TO authenticated;

COMMENT ON TABLE course_resume_points IS 'Tracks resume points for courses to enable deep linking and cross-device sync';
COMMENT ON FUNCTION get_course_resume_point IS 'Get resume point for a child and course';

