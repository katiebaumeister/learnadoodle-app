-- Mastery Intelligence Hub Migration
-- Adds support for gradebook, assignment scoring, skill-based grading, parent review workflow,
-- standards coverage analytics, and auto-progress estimation
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================================
-- 1. Create rubrics table (if it doesn't exist) - MUST BE FIRST for foreign key references
-- ============================================================================
CREATE TABLE IF NOT EXISTS rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of {criterion, points, description}
  total_points numeric NOT NULL DEFAULT 100 CHECK (total_points > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS rubrics_family_idx ON rubrics(family_id);
CREATE INDEX IF NOT EXISTS rubrics_created_at_idx ON rubrics(created_at DESC);

ALTER TABLE rubrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_rubrics ON rubrics;
CREATE POLICY family_read_own_rubrics ON rubrics
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_rubrics ON rubrics;
CREATE POLICY family_insert_own_rubrics ON rubrics
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_rubrics ON rubrics;
CREATE POLICY family_update_own_rubrics ON rubrics
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_rubrics ON rubrics;
CREATE POLICY family_delete_own_rubrics ON rubrics
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON rubrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rubrics TO service_role;

-- ============================================================================
-- 2. Extend assignments table with scoring and review workflow
-- ============================================================================
DO $$
BEGIN
  -- Add score column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'score'
  ) THEN
    ALTER TABLE assignments ADD COLUMN score numeric CHECK (score >= 0 AND score <= 100);
  END IF;

  -- Add max_score column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'max_score'
  ) THEN
    ALTER TABLE assignments ADD COLUMN max_score numeric DEFAULT 100 CHECK (max_score > 0);
  END IF;

  -- Add rubric_id column if it doesn't exist (now rubrics table exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'rubric_id'
  ) THEN
    ALTER TABLE assignments ADD COLUMN rubric_id uuid REFERENCES rubrics(id) ON DELETE SET NULL;
  END IF;

  -- Add review_status column (extends status enum)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE assignments ADD COLUMN review_status text CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_revision'));
  END IF;

  -- Add review_feedback column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'review_feedback'
  ) THEN
    ALTER TABLE assignments ADD COLUMN review_feedback text;
  END IF;

  -- Add ai_feedback column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'ai_feedback'
  ) THEN
    ALTER TABLE assignments ADD COLUMN ai_feedback text;
  END IF;

  -- Add ai_feedback_generated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'ai_feedback_generated_at'
  ) THEN
    ALTER TABLE assignments ADD COLUMN ai_feedback_generated_at timestamptz;
  END IF;

  -- Update status constraint to include new statuses
  -- Note: PostgreSQL doesn't support ALTER CHECK constraint easily, so we'll handle this in application logic
END $$;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS assignments_score_idx ON assignments(score) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_review_status_idx ON assignments(review_status) WHERE review_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_rubric_idx ON assignments(rubric_id) WHERE rubric_id IS NOT NULL;

-- ============================================================================
-- 3. Create gradebook_categories table
-- ============================================================================
CREATE TABLE IF NOT EXISTS gradebook_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id) ON DELETE SET NULL,
  name text NOT NULL,
  weight numeric NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1), -- 0-1, sum should be <= 1
  display_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS gradebook_categories_family_child_idx ON gradebook_categories(family_id, child_id);
CREATE INDEX IF NOT EXISTS gradebook_categories_subject_idx ON gradebook_categories(subject_id) WHERE subject_id IS NOT NULL;

ALTER TABLE gradebook_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_gradebook_categories ON gradebook_categories;
CREATE POLICY family_read_own_gradebook_categories ON gradebook_categories
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_gradebook_categories ON gradebook_categories;
CREATE POLICY family_insert_own_gradebook_categories ON gradebook_categories
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_gradebook_categories ON gradebook_categories;
CREATE POLICY family_update_own_gradebook_categories ON gradebook_categories
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_gradebook_categories ON gradebook_categories;
CREATE POLICY family_delete_own_gradebook_categories ON gradebook_categories
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON gradebook_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gradebook_categories TO service_role;

-- ============================================================================
-- 5. Extend grades table to link to assignments and categories
-- ============================================================================
DO $$
BEGIN
  -- Add assignment_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'assignment_id'
  ) THEN
    ALTER TABLE grades ADD COLUMN assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL;
  END IF;

  -- Add category_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE grades ADD COLUMN category_id uuid REFERENCES gradebook_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS grades_assignment_idx ON grades(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS grades_category_idx ON grades(category_id) WHERE category_id IS NOT NULL;

-- ============================================================================
-- 6. Create skill_grades table for skill-based grading
-- ============================================================================
CREATE TABLE IF NOT EXISTS skill_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  skill text NOT NULL, -- Skill name/identifier
  subject_id uuid REFERENCES subject(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES events(id) ON DELETE SET NULL,
  level numeric NOT NULL CHECK (level >= 0 AND level <= 5), -- 0-5 scale
  evidence_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS skill_grades_family_child_idx ON skill_grades(family_id, child_id);
CREATE INDEX IF NOT EXISTS skill_grades_child_skill_idx ON skill_grades(child_id, skill);
CREATE INDEX IF NOT EXISTS skill_grades_subject_idx ON skill_grades(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS skill_grades_assignment_idx ON skill_grades(assignment_id) WHERE assignment_id IS NOT NULL;

ALTER TABLE skill_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_skill_grades ON skill_grades;
CREATE POLICY family_read_own_skill_grades ON skill_grades
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_skill_grades ON skill_grades;
CREATE POLICY family_insert_own_skill_grades ON skill_grades
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_skill_grades ON skill_grades;
CREATE POLICY family_update_own_skill_grades ON skill_grades
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_skill_grades ON skill_grades;
CREATE POLICY family_delete_own_skill_grades ON skill_grades
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON skill_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_grades TO service_role;

-- ============================================================================
-- 7. Create standards_coverage_analytics view
-- ============================================================================
CREATE OR REPLACE VIEW standards_coverage_analytics AS
SELECT 
  c.id AS child_id,
  c.family_id,
  s.id AS standard_id,
  s.state_code,
  s.grade_level,
  s.subject,
  s.standard_code,
  s.standard_text,
  COUNT(DISTINCT ls.lesson_id) AS lessons_covering_count,
  COUNT(DISTINCT ssm.id) AS mastery_records_count,
  MAX(CASE WHEN ssm.mastery_level = 'mastered' THEN 1 ELSE 0 END) AS is_mastered,
  MAX(ssm.score) AS highest_score,
  MAX(ssm.updated_at) AS last_assessed_at
FROM children c
CROSS JOIN standards s
LEFT JOIN lesson_standards ls ON ls.standard_id = s.id
LEFT JOIN events e ON e.id = ls.lesson_id AND e.child_id = c.id
LEFT JOIN student_standard_mastery ssm ON ssm.student_id = c.id AND ssm.standard_id = s.id
GROUP BY c.id, c.family_id, s.id, s.state_code, s.grade_level, s.subject, s.standard_code, s.standard_text;

-- Grant access to view
GRANT SELECT ON standards_coverage_analytics TO authenticated;
GRANT SELECT ON standards_coverage_analytics TO service_role;

-- ============================================================================
-- 8. Create assignment_reviews table for detailed review tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS assignment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id),
  review_status text NOT NULL CHECK (review_status IN ('approved', 'rejected', 'needs_revision')),
  rating integer CHECK (rating >= 1 AND rating <= 5),
  feedback text,
  rubric_scores jsonb, -- {criterion_id: score} mapping
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_reviews_assignment_idx ON assignment_reviews(assignment_id);
CREATE INDEX IF NOT EXISTS assignment_reviews_reviewer_idx ON assignment_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS assignment_reviews_status_idx ON assignment_reviews(review_status);

ALTER TABLE assignment_reviews ENABLE ROW LEVEL SECURITY;

-- RLS: Users can see reviews for assignments in their family
DROP POLICY IF EXISTS family_read_own_assignment_reviews ON assignment_reviews;
CREATE POLICY family_read_own_assignment_reviews ON assignment_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_reviews.assignment_id
      AND is_family_member(a.family_id)
    )
  );

DROP POLICY IF EXISTS family_insert_own_assignment_reviews ON assignment_reviews;
CREATE POLICY family_insert_own_assignment_reviews ON assignment_reviews
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_reviews.assignment_id
      AND is_family_member(a.family_id)
    )
  );

DROP POLICY IF EXISTS family_update_own_assignment_reviews ON assignment_reviews;
CREATE POLICY family_update_own_assignment_reviews ON assignment_reviews
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_reviews.assignment_id
      AND is_family_member(a.family_id)
    )
  );

GRANT SELECT, INSERT, UPDATE ON assignment_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE ON assignment_reviews TO service_role;

-- ============================================================================
-- 9. Create progress_estimations table for auto-progress estimation
-- ============================================================================
CREATE TABLE IF NOT EXISTS progress_estimations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id) ON DELETE SET NULL,
  estimation_type text NOT NULL CHECK (estimation_type IN ('syllabus_completion', 'standards_coverage', 'skill_mastery', 'overall')),
  estimated_completion_date date,
  estimated_completion_percentage numeric CHECK (estimated_completion_percentage >= 0 AND estimated_completion_percentage <= 100),
  confidence_score numeric CHECK (confidence_score >= 0 AND confidence_score <= 1),
  factors jsonb, -- JSON object with factors that influenced the estimation
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS progress_estimations_family_child_idx ON progress_estimations(family_id, child_id);
CREATE INDEX IF NOT EXISTS progress_estimations_child_subject_idx ON progress_estimations(child_id, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS progress_estimations_type_idx ON progress_estimations(estimation_type);
CREATE INDEX IF NOT EXISTS progress_estimations_calculated_at_idx ON progress_estimations(calculated_at DESC);

ALTER TABLE progress_estimations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_progress_estimations ON progress_estimations;
CREATE POLICY family_read_own_progress_estimations ON progress_estimations
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_progress_estimations ON progress_estimations;
CREATE POLICY family_insert_own_progress_estimations ON progress_estimations
  FOR INSERT WITH CHECK (is_family_member(family_id));

GRANT SELECT, INSERT ON progress_estimations TO authenticated;
GRANT SELECT, INSERT ON progress_estimations TO service_role;

-- ============================================================================
-- 10. Update review_assignment function to support new workflow
-- ============================================================================
CREATE OR REPLACE FUNCTION review_assignment(
  p_assignment_id uuid,
  p_rating integer DEFAULT NULL,
  p_feedback text DEFAULT NULL,
  p_review_status text DEFAULT NULL -- 'approved', 'rejected', 'needs_revision'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment assignments%ROWTYPE;
  v_user_family_id uuid;
  v_new_status text;
  v_review_id uuid;
BEGIN
  -- Get assignment
  SELECT * INTO v_assignment
  FROM assignments
  WHERE id = p_assignment_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Get user's family_id
  SELECT family_id INTO v_user_family_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
  
  -- Verify user has access to this assignment's family
  IF v_user_family_id IS NULL OR v_user_family_id != v_assignment.family_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Validate review_status if provided
  IF p_review_status IS NOT NULL AND p_review_status NOT IN ('approved', 'rejected', 'needs_revision') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid review_status. Must be approved, rejected, or needs_revision');
  END IF;
  
  -- Determine new status based on review_status
  IF p_review_status = 'approved' THEN
    v_new_status := 'accepted';
  ELSIF p_review_status = 'rejected' THEN
    v_new_status := 'reviewed'; -- Keep as reviewed but mark as rejected
  ELSIF p_review_status = 'needs_revision' THEN
    v_new_status := 'submitted'; -- Return to submitted for revision
  ELSE
    v_new_status := COALESCE(v_assignment.status, 'reviewed');
  END IF;
  
  -- Create review record
  INSERT INTO assignment_reviews (
    assignment_id,
    reviewer_id,
    review_status,
    rating,
    feedback
  ) VALUES (
    p_assignment_id,
    auth.uid(),
    COALESCE(p_review_status, 'approved'),
    p_rating,
    p_feedback
  )
  RETURNING id INTO v_review_id;
  
  -- Update assignment status and review fields
  UPDATE assignments
  SET 
    status = v_new_status,
    review_status = p_review_status,
    review_feedback = p_feedback,
    updated_at = now()
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'status', v_new_status,
    'review_status', p_review_status,
    'review_id', v_review_id
  );
END;
$$;

-- ============================================================================
-- 11. Add Canadian/international standards support (if easy lift)
-- ============================================================================
-- Extend standards table to support country codes
DO $$
BEGIN
  -- Add country_code column if it doesn't exist (defaults to 'US')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'standards' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE standards ADD COLUMN country_code text DEFAULT 'US' CHECK (char_length(country_code) = 2);
    -- Update existing records to be US
    UPDATE standards SET country_code = 'US' WHERE country_code IS NULL;
  END IF;

  -- Add province_code column for Canadian provinces
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'standards' AND column_name = 'province_code'
  ) THEN
    ALTER TABLE standards ADD COLUMN province_code text CHECK (char_length(province_code) = 2);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS standards_country_idx ON standards(country_code);
CREATE INDEX IF NOT EXISTS standards_province_idx ON standards(province_code) WHERE province_code IS NOT NULL;

-- ============================================================================
-- 12. Create function to calculate gradebook grade with categories
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_gradebook_grade(
  p_child_id uuid,
  p_subject_id uuid,
  p_term_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_category jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_total_weighted_score numeric := 0;
  v_total_weight numeric := 0;
  v_final_grade numeric;
BEGIN
  -- Get all categories for this child/subject
  FOR v_category IN
    SELECT 
      gc.id,
      gc.name,
      gc.weight,
      COALESCE(
        AVG(g.score),
        0
      ) AS average_score,
      COUNT(g.id) AS grade_count
    FROM gradebook_categories gc
    LEFT JOIN grades g ON g.category_id = gc.id
      AND g.child_id = p_child_id
      AND (p_subject_id IS NULL OR g.subject_id = p_subject_id)
      AND (p_term_label IS NULL OR g.term_label = p_term_label)
    WHERE gc.child_id = p_child_id
      AND (p_subject_id IS NULL OR gc.subject_id = p_subject_id)
    GROUP BY gc.id, gc.name, gc.weight, gc.display_order
    ORDER BY gc.display_order, gc.name
  LOOP
    v_categories := v_categories || jsonb_build_object(
      'category_id', v_category->>'id',
      'name', v_category->>'name',
      'weight', (v_category->>'weight')::numeric,
      'average_score', (v_category->>'average_score')::numeric,
      'grade_count', (v_category->>'grade_count')::integer
    );
    
    -- Calculate weighted contribution
    IF (v_category->>'average_score')::numeric > 0 THEN
      v_total_weighted_score := v_total_weighted_score + 
        ((v_category->>'average_score')::numeric * (v_category->>'weight')::numeric);
      v_total_weight := v_total_weight + (v_category->>'weight')::numeric;
    END IF;
  END LOOP;
  
  -- Calculate final grade
  IF v_total_weight > 0 THEN
    v_final_grade := v_total_weighted_score / v_total_weight;
  ELSE
    v_final_grade := NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'child_id', p_child_id,
    'subject_id', p_subject_id,
    'term_label', p_term_label,
    'categories', v_categories,
    'final_grade', v_final_grade,
    'total_weight', v_total_weight
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_gradebook_grade(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_gradebook_grade(uuid, uuid, text) TO service_role;

-- ============================================================================
-- 13. Create function to estimate progress automatically
-- ============================================================================
CREATE OR REPLACE FUNCTION estimate_progress(
  p_child_id uuid,
  p_subject_id uuid DEFAULT NULL,
  p_estimation_type text DEFAULT 'overall'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_factors jsonb := '{}'::jsonb;
  v_completion_percentage numeric := 0;
  v_estimated_date date;
  v_confidence numeric := 0.5;
  v_total_events integer := 0;
  v_completed_events integer := 0;
  v_total_standards integer := 0;
  v_mastered_standards integer := 0;
  v_days_elapsed integer := 0;
  v_days_remaining integer := 0;
  v_current_date date := CURRENT_DATE;
  v_academic_year_start date;
BEGIN
  -- Get academic year start (approximate - first event or current year start)
  SELECT MIN(DATE(start_ts)) INTO v_academic_year_start
  FROM events
  WHERE child_id = p_child_id
    AND (p_subject_id IS NULL OR subject_id = p_subject_id);
  
  IF v_academic_year_start IS NULL THEN
    v_academic_year_start := DATE_TRUNC('year', v_current_date);
  END IF;
  
  v_days_elapsed := v_current_date - v_academic_year_start;
  
  -- Count events
  SELECT 
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*)
  INTO v_completed_events, v_total_events
  FROM events
  WHERE child_id = p_child_id
    AND (p_subject_id IS NULL OR subject_id = p_subject_id)
    AND DATE(start_ts) >= v_academic_year_start;
  
  -- Count standards mastery
  SELECT 
    COUNT(*) FILTER (WHERE mastery_level = 'mastered'),
    COUNT(*)
  INTO v_mastered_standards, v_total_standards
  FROM student_standard_mastery
  WHERE student_id = p_child_id
    AND EXISTS (
      SELECT 1 FROM standards s
      WHERE s.id = student_standard_mastery.standard_id
      AND (p_subject_id IS NULL OR s.subject_id = p_subject_id)
    );
  
  -- Calculate completion percentage based on type
  IF p_estimation_type = 'syllabus_completion' THEN
    -- Estimate based on completed events vs total planned
    IF v_total_events > 0 THEN
      v_completion_percentage := (v_completed_events::numeric / v_total_events::numeric) * 100;
      v_factors := jsonb_build_object(
        'completed_events', v_completed_events,
        'total_events', v_total_events,
        'events_completion_rate', v_completion_percentage
      );
    END IF;
  ELSIF p_estimation_type = 'standards_coverage' THEN
    -- Estimate based on standards mastery
    IF v_total_standards > 0 THEN
      v_completion_percentage := (v_mastered_standards::numeric / v_total_standards::numeric) * 100;
      v_factors := jsonb_build_object(
        'mastered_standards', v_mastered_standards,
        'total_standards', v_total_standards,
        'standards_completion_rate', v_completion_percentage
      );
    END IF;
  ELSE
    -- Overall: combine multiple factors
    DECLARE
      v_events_pct numeric := 0;
      v_standards_pct numeric := 0;
    BEGIN
      IF v_total_events > 0 THEN
        v_events_pct := (v_completed_events::numeric / v_total_events::numeric) * 100;
      END IF;
      IF v_total_standards > 0 THEN
        v_standards_pct := (v_mastered_standards::numeric / v_total_standards::numeric) * 100;
      END IF;
      
      -- Weighted average: 60% events, 40% standards
      IF v_total_events > 0 AND v_total_standards > 0 THEN
        v_completion_percentage := (v_events_pct * 0.6) + (v_standards_pct * 0.4);
      ELSIF v_total_events > 0 THEN
        v_completion_percentage := v_events_pct;
      ELSIF v_total_standards > 0 THEN
        v_completion_percentage := v_standards_pct;
      END IF;
      
      v_factors := jsonb_build_object(
        'completed_events', v_completed_events,
        'total_events', v_total_events,
        'events_completion_rate', v_events_pct,
        'mastered_standards', v_mastered_standards,
        'total_standards', v_total_standards,
        'standards_completion_rate', v_standards_pct,
        'days_elapsed', v_days_elapsed
      );
    END;
  END IF;
  
  -- Estimate completion date (assuming 180 school days per year)
  IF v_completion_percentage > 0 AND v_days_elapsed > 0 THEN
    DECLARE
      v_daily_rate numeric;
      v_days_to_complete integer;
    BEGIN
      v_daily_rate := v_completion_percentage / v_days_elapsed;
      IF v_daily_rate > 0 THEN
        v_days_to_complete := CEIL((100 - v_completion_percentage) / v_daily_rate);
        v_estimated_date := v_current_date + (v_days_to_complete || ' days')::interval;
      ELSE
        v_estimated_date := v_current_date + '180 days'::interval;
      END IF;
    END;
  ELSE
    v_estimated_date := v_current_date + '180 days'::interval;
  END IF;
  
  -- Calculate confidence based on data availability
  v_confidence := 0.5;
  IF v_total_events > 10 AND v_total_standards > 5 THEN
    v_confidence := 0.8;
  ELSIF v_total_events > 5 OR v_total_standards > 3 THEN
    v_confidence := 0.6;
  END IF;
  
  -- Store estimation
  INSERT INTO progress_estimations (
    family_id,
    child_id,
    subject_id,
    estimation_type,
    estimated_completion_date,
    estimated_completion_percentage,
    confidence_score,
    factors
  )
  SELECT 
    c.family_id,
    p_child_id,
    p_subject_id,
    p_estimation_type,
    v_estimated_date,
    v_completion_percentage,
    v_confidence,
    v_factors
  FROM children c
  WHERE c.id = p_child_id
  ON CONFLICT DO NOTHING;
  
  RETURN jsonb_build_object(
    'child_id', p_child_id,
    'subject_id', p_subject_id,
    'estimation_type', p_estimation_type,
    'estimated_completion_percentage', v_completion_percentage,
    'estimated_completion_date', v_estimated_date,
    'confidence_score', v_confidence,
    'factors', v_factors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION estimate_progress(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION estimate_progress(uuid, uuid, text) TO service_role;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE rubrics IS 'Rubrics for grading assignments with criteria and point values';
COMMENT ON TABLE gradebook_categories IS 'Gradebook categories with weightings for calculating final grades';
COMMENT ON TABLE skill_grades IS 'Skill-based grading records (0-5 scale)';
COMMENT ON TABLE assignment_reviews IS 'Detailed review records for assignments with approve/reject/needs_revision workflow';
COMMENT ON TABLE progress_estimations IS 'Auto-calculated progress estimations for students';
COMMENT ON VIEW standards_coverage_analytics IS 'Analytics view for standards coverage tracking';

