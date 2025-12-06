-- Assignments, Gamification & AI Enhancements Migration
-- Adds streaks, XP, rubrics, reminders, and AI features
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================
-- 1. Gamification: Streaks & XP
-- ============================================================

CREATE TABLE IF NOT EXISTS child_gamification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  total_xp integer DEFAULT 0,
  level integer DEFAULT 1,
  last_activity_date date,
  streak_type text DEFAULT 'daily' CHECK (streak_type IN ('daily', 'weekly', 'assignment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, streak_type)
);

CREATE INDEX IF NOT EXISTS child_gamification_child_idx ON child_gamification(child_id);
CREATE INDEX IF NOT EXISTS child_gamification_family_idx ON child_gamification(family_id);

ALTER TABLE child_gamification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_gamification ON child_gamification;
CREATE POLICY family_read_gamification
ON child_gamification
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_gamification ON child_gamification;
CREATE POLICY family_update_gamification
ON child_gamification
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- XP History
CREATE TABLE IF NOT EXISTS xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  xp_amount integer NOT NULL,
  xp_type text NOT NULL CHECK (xp_type IN ('assignment_complete', 'streak_bonus', 'daily_checklist', 'review_task', 'practice_set', 'other')),
  source_id uuid, -- Can reference assignments, events, etc.
  source_type text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xp_transactions_child_idx ON xp_transactions(child_id);
CREATE INDEX IF NOT EXISTS xp_transactions_created_idx ON xp_transactions(created_at DESC);

ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_xp ON xp_transactions;
CREATE POLICY family_read_xp
ON xp_transactions
FOR SELECT
USING (is_family_member(family_id));

-- ============================================================
-- 2. Rubrics for Assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of {name, description, max_points, weight}
  total_points integer,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rubrics_family_idx ON rubrics(family_id);

ALTER TABLE rubrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_rubrics ON rubrics;
CREATE POLICY family_read_rubrics
ON rubrics
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_manage_rubrics ON rubrics;
CREATE POLICY family_manage_rubrics
ON rubrics
FOR ALL
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- Add rubric fields to assignments
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS rubric_id uuid REFERENCES rubrics(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rubric_scores jsonb DEFAULT '[]'::jsonb, -- {criterion_id, points, feedback}
ADD COLUMN IF NOT EXISTS review_status text CHECK (review_status IN ('pending', 'approved', 'needs_revision', 'rejected')),
ADD COLUMN IF NOT EXISTS review_feedback text,
ADD COLUMN IF NOT EXISTS review_rating integer CHECK (review_rating >= 1 AND review_rating <= 5),
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- ============================================================
-- 3. Daily Checklist & Personalized Tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  date date NOT NULL,
  title text NOT NULL,
  description text,
  task_type text DEFAULT 'assignment' CHECK (task_type IN ('assignment', 'review', 'practice', 'custom')),
  linked_assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  linked_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  priority integer DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  completed boolean DEFAULT false,
  completed_at timestamptz,
  estimated_minutes integer,
  cognitive_load text DEFAULT 'medium' CHECK (cognitive_load IN ('low', 'medium', 'high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, date, title) -- Prevent duplicates
);

CREATE INDEX IF NOT EXISTS daily_checklist_child_date_idx ON daily_checklist_items(child_id, date);
CREATE INDEX IF NOT EXISTS daily_checklist_family_idx ON daily_checklist_items(family_id);
CREATE INDEX IF NOT EXISTS daily_checklist_completed_idx ON daily_checklist_items(completed);

ALTER TABLE daily_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_checklist ON daily_checklist_items;
CREATE POLICY family_read_checklist
ON daily_checklist_items
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_manage_checklist ON daily_checklist_items;
CREATE POLICY family_manage_checklist
ON daily_checklist_items
FOR ALL
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 4. Reminders & Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('assignment_due', 'daily_task', 'review_needed', 'practice_time', 'custom')),
  title text NOT NULL,
  message text,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed', 'cancelled')),
  linked_assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  linked_checklist_item_id uuid REFERENCES daily_checklist_items(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reminders_family_idx ON reminders(family_id);
CREATE INDEX IF NOT EXISTS reminders_child_idx ON reminders(child_id);
CREATE INDEX IF NOT EXISTS reminders_scheduled_idx ON reminders(scheduled_for) WHERE status = 'pending';

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_reminders ON reminders;
CREATE POLICY family_read_reminders
ON reminders
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_manage_reminders ON reminders;
CREATE POLICY family_manage_reminders
ON reminders
FOR ALL
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 5. AI-Generated Assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_generated_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('syllabus', 'youtube', 'text', 'url')),
  source_content text, -- URL, text, or syllabus section ID
  generated_title text NOT NULL,
  generated_description text,
  generated_instructions text,
  cognitive_load text DEFAULT 'medium',
  estimated_duration_minutes integer,
  difficulty_level text DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  subject_id uuid REFERENCES subject(id) ON DELETE SET NULL,
  syllabus_unit_id uuid,
  ai_model text,
  ai_prompt text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'assigned', 'rejected')),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_as_assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ai_assignments_family_idx ON ai_generated_assignments(family_id);
CREATE INDEX IF NOT EXISTS ai_assignments_child_idx ON ai_generated_assignments(child_id);
CREATE INDEX IF NOT EXISTS ai_assignments_status_idx ON ai_generated_assignments(status);

ALTER TABLE ai_generated_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_ai_assignments ON ai_generated_assignments;
CREATE POLICY family_read_ai_assignments
ON ai_generated_assignments
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_manage_ai_assignments ON ai_generated_assignments;
CREATE POLICY family_manage_ai_assignments
ON ai_generated_assignments
FOR ALL
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 6. AI Recommendations
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('review_task', 'practice_set', 'assignment', 'study_session')),
  title text NOT NULL,
  description text,
  reason text, -- Why this was recommended
  priority integer DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  linked_content_id uuid, -- Can reference assignments, syllabus sections, etc.
  linked_content_type text,
  cognitive_load text DEFAULT 'medium',
  estimated_benefit text, -- Expected learning outcome
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'completed')),
  ai_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_recommendations_family_idx ON ai_recommendations(family_id);
CREATE INDEX IF NOT EXISTS ai_recommendations_child_idx ON ai_recommendations(child_id);
CREATE INDEX IF NOT EXISTS ai_recommendations_status_idx ON ai_recommendations(status) WHERE status = 'pending';

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_recommendations ON ai_recommendations;
CREATE POLICY family_read_recommendations
ON ai_recommendations
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_manage_recommendations ON ai_recommendations;
CREATE POLICY family_manage_recommendations
ON ai_recommendations
FOR ALL
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 7. Helper Functions
-- ============================================================

-- Update streak and XP when assignment is completed
CREATE OR REPLACE FUNCTION update_gamification_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_xp_amount integer;
  v_streak_type text := 'daily';
BEGIN
  -- Only process when status changes to 'accepted' or 'reviewed'
  IF NEW.status IN ('accepted', 'reviewed') AND OLD.status NOT IN ('accepted', 'reviewed') THEN
    -- Award XP for assignment completion
    v_xp_amount := 50; -- Base XP for completing assignment
    
    -- Insert XP transaction
    INSERT INTO xp_transactions (child_id, family_id, xp_amount, xp_type, source_id, source_type, description)
    VALUES (
      NEW.child_id,
      NEW.family_id,
      v_xp_amount,
      'assignment_complete',
      NEW.id,
      'assignment',
      'Completed assignment: ' || NEW.title
    );
    
    -- Update gamification record
    INSERT INTO child_gamification (child_id, family_id, total_xp, last_activity_date, streak_type)
    VALUES (NEW.child_id, NEW.family_id, v_xp_amount, CURRENT_DATE, v_streak_type)
    ON CONFLICT (child_id, streak_type)
    DO UPDATE SET
      total_xp = child_gamification.total_xp + v_xp_amount,
      last_activity_date = CURRENT_DATE,
      updated_at = now();
    
    -- Update streak if last activity was yesterday or today
    UPDATE child_gamification
    SET
      current_streak = CASE
        WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day' OR last_activity_date = CURRENT_DATE THEN
          current_streak + 1
        ELSE
          1
      END,
      longest_streak = GREATEST(longest_streak, 
        CASE
          WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day' OR last_activity_date = CURRENT_DATE THEN
            current_streak + 1
          ELSE
            1
        END
      ),
      last_activity_date = CURRENT_DATE
    WHERE child_id = NEW.child_id AND streak_type = v_streak_type;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for assignment completion
DROP TRIGGER IF EXISTS trigger_update_gamification_on_completion ON assignments;
CREATE TRIGGER trigger_update_gamification_on_completion
AFTER UPDATE OF status ON assignments
FOR EACH ROW
WHEN (NEW.status IN ('accepted', 'reviewed') AND OLD.status NOT IN ('accepted', 'reviewed'))
EXECUTE FUNCTION update_gamification_on_completion();

-- Function to calculate XP needed for next level
CREATE OR REPLACE FUNCTION get_xp_for_level(level_num integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- XP formula: 100 * level^1.5 (rounded)
  RETURN ROUND(100 * POWER(level_num, 1.5))::integer;
END;
$$;

-- Function to update child level based on XP
CREATE OR REPLACE FUNCTION update_child_level(p_child_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_xp integer;
  v_current_level integer;
  v_xp_for_next integer;
  v_new_level integer;
BEGIN
  SELECT total_xp, level INTO v_total_xp, v_current_level
  FROM child_gamification
  WHERE child_id = p_child_id AND streak_type = 'daily';
  
  IF v_total_xp IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate what level they should be
  v_new_level := 1;
  LOOP
    v_xp_for_next := get_xp_for_level(v_new_level);
    IF v_total_xp < v_xp_for_next THEN
      EXIT;
    END IF;
    v_new_level := v_new_level + 1;
    -- Safety limit
    IF v_new_level > 100 THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Update level if it changed
  IF v_new_level > v_current_level THEN
    UPDATE child_gamification
    SET level = v_new_level
    WHERE child_id = p_child_id AND streak_type = 'daily';
  END IF;
END;
$$;

-- ============================================================
-- 8. Update assignments table for one-tap submission
-- ============================================================

-- Add quick_submit flag (for one-tap submission)
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS quick_submit_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS submission_media jsonb DEFAULT '[]'::jsonb; -- Array of {type, url, thumbnail} for quick photo/video uploads

-- ============================================================
-- 9. Comments/Feedback on Assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id),
  comment_text text NOT NULL,
  comment_type text DEFAULT 'feedback' CHECK (comment_type IN ('feedback', 'question', 'clarification', 'praise')),
  is_internal boolean DEFAULT false, -- Internal notes vs visible to student
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_comments_assignment_idx ON assignment_comments(assignment_id);
CREATE INDEX IF NOT EXISTS assignment_comments_family_idx ON assignment_comments(family_id);

ALTER TABLE assignment_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_comments ON assignment_comments;
CREATE POLICY family_read_comments
ON assignment_comments
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_manage_comments ON assignment_comments;
CREATE POLICY family_manage_comments
ON assignment_comments
FOR ALL
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

