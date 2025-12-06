-- AI Coach, Advanced Insights, Template Generation, Workload Balancing, Review Recommendations
-- Comprehensive AI features implementation

-- ============================================================
-- 1. AI Personal Learning Coach Tables
-- ============================================================

-- Coach sessions for parents and children
CREATE TABLE IF NOT EXISTS ai_coach_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id), -- NULL for child sessions
  child_id uuid REFERENCES children(id) ON DELETE CASCADE, -- NULL for parent sessions
  session_type text NOT NULL CHECK (session_type IN ('parent', 'child')),
  conversation_history jsonb DEFAULT '[]'::jsonb, -- Array of {role, content, timestamp}
  context_data jsonb DEFAULT '{}'::jsonb, -- Learning context, progress, goals
  goals jsonb DEFAULT '[]'::jsonb, -- Learning goals and objectives
  preferences jsonb DEFAULT '{}'::jsonb, -- User preferences for coaching style
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_interaction_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_coach_sessions_family_idx ON ai_coach_sessions(family_id);
CREATE INDEX IF NOT EXISTS ai_coach_sessions_user_idx ON ai_coach_sessions(user_id);
CREATE INDEX IF NOT EXISTS ai_coach_sessions_child_idx ON ai_coach_sessions(child_id);
CREATE INDEX IF NOT EXISTS ai_coach_sessions_type_idx ON ai_coach_sessions(session_type);

-- Coach recommendations and action items
CREATE TABLE IF NOT EXISTS ai_coach_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ai_coach_sessions(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('learning_strategy', 'resource', 'schedule_adjustment', 'goal_setting', 'motivation')),
  title text NOT NULL,
  description text,
  action_items jsonb DEFAULT '[]'::jsonb, -- Specific actionable steps
  priority integer DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'completed')),
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_coach_recommendations_session_idx ON ai_coach_recommendations(session_id);
CREATE INDEX IF NOT EXISTS ai_coach_recommendations_status_idx ON ai_coach_recommendations(status);

-- ============================================================
-- 2. Advanced AI Insights Engine Tables
-- ============================================================

-- Enhanced insights with multiple layers
CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE, -- NULL for family-level insights
  insight_type text NOT NULL CHECK (insight_type IN ('emotional', 'tactical', 'strategic', 'predictive', 'prescriptive')),
  layer text NOT NULL CHECK (layer IN ('surface', 'pattern', 'deep', 'predictive')),
  title text NOT NULL,
  description text NOT NULL,
  data_points jsonb DEFAULT '{}'::jsonb, -- Supporting data for the insight
  confidence_score numeric(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  impact_score integer DEFAULT 3 CHECK (impact_score >= 1 AND impact_score <= 5),
  actionable boolean DEFAULT true,
  proposed_changes jsonb DEFAULT '[]'::jsonb, -- Suggested actions based on insight
  related_insights uuid[], -- Array of related insight IDs
  generated_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz, -- When insight becomes stale
  viewed_at timestamptz,
  dismissed_at timestamptz,
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_insights_family_idx ON ai_insights(family_id);
CREATE INDEX IF NOT EXISTS ai_insights_child_idx ON ai_insights(child_id);
CREATE INDEX IF NOT EXISTS ai_insights_type_idx ON ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS ai_insights_layer_idx ON ai_insights(layer);
CREATE INDEX IF NOT EXISTS ai_insights_generated_idx ON ai_insights(generated_at DESC);
CREATE INDEX IF NOT EXISTS ai_insights_actionable_idx ON ai_insights(actionable) WHERE actionable = true;

-- Insight generation history for tracking patterns
CREATE TABLE IF NOT EXISTS ai_insight_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  generation_type text NOT NULL,
  context_snapshot jsonb DEFAULT '{}'::jsonb,
  insights_generated integer DEFAULT 0,
  processing_time_ms integer,
  model_version text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_insight_generation_log_family_idx ON ai_insight_generation_log(family_id);
CREATE INDEX IF NOT EXISTS ai_insight_generation_log_created_idx ON ai_insight_generation_log(created_at DESC);

-- ============================================================
-- 3. AI Template Generation Tables
-- ============================================================

-- AI-generated templates from topics
CREATE TABLE IF NOT EXISTS ai_generated_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES family(id) ON DELETE CASCADE, -- NULL for public/system templates
  created_by uuid REFERENCES profiles(id),
  source_type text NOT NULL CHECK (source_type IN ('topic', 'syllabus', 'curriculum', 'learning_goal', 'subject')),
  source_data jsonb DEFAULT '{}'::jsonb, -- Original topic/syllabus data
  template_name text NOT NULL,
  template_description text,
  template_type text DEFAULT 'lesson' CHECK (template_type IN ('lesson', 'unit', 'sequence', 'plan')),
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb, -- Generated template structure
  subjects text[],
  grade_levels text[],
  estimated_duration_days integer,
  cognitive_load_profile jsonb DEFAULT '{}'::jsonb, -- Load distribution across template
  generation_prompt text, -- The prompt used to generate this
  model_version text,
  confidence_score numeric(3,2) DEFAULT 0.5,
  is_public boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_generated_templates_family_idx ON ai_generated_templates(family_id);
CREATE INDEX IF NOT EXISTS ai_generated_templates_source_type_idx ON ai_generated_templates(source_type);
CREATE INDEX IF NOT EXISTS ai_generated_templates_template_type_idx ON ai_generated_templates(template_type);
CREATE INDEX IF NOT EXISTS ai_generated_templates_public_idx ON ai_generated_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS ai_generated_templates_subjects_idx ON ai_generated_templates USING GIN(subjects);

-- Template generation requests/queue
CREATE TABLE IF NOT EXISTS ai_template_generation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  source_type text NOT NULL,
  source_data jsonb NOT NULL,
  requested_template_type text DEFAULT 'lesson',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_template_id uuid REFERENCES ai_generated_templates(id),
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  processed_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_template_generation_queue_status_idx ON ai_template_generation_queue(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS ai_template_generation_queue_family_idx ON ai_template_generation_queue(family_id);

-- ============================================================
-- 4. Enhanced Workload Balancing Tables
-- ============================================================

-- Cognitive load analysis and balancing history
CREATE TABLE IF NOT EXISTS ai_workload_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  analysis_date date NOT NULL,
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  daily_loads jsonb NOT NULL DEFAULT '{}'::jsonb, -- {date: {total_load, assignments, checklist, cognitive_breakdown}}
  overloaded_days jsonb DEFAULT '[]'::jsonb,
  underloaded_days jsonb DEFAULT '[]'::jsonb,
  balanced_days jsonb DEFAULT '[]'::jsonb,
  suggestions jsonb DEFAULT '[]'::jsonb,
  applied_suggestions jsonb DEFAULT '[]'::jsonb,
  target_daily_load text DEFAULT 'medium',
  balance_score numeric(3,2), -- 0-1 score of how balanced the workload is
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_workload_analyses_child_idx ON ai_workload_analyses(child_id);
CREATE INDEX IF NOT EXISTS ai_workload_analyses_date_idx ON ai_workload_analyses(analysis_date DESC);
CREATE INDEX IF NOT EXISTS ai_workload_analyses_family_idx ON ai_workload_analyses(family_id);

-- Cognitive load patterns and trends
CREATE TABLE IF NOT EXISTS ai_cognitive_load_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  pattern_type text NOT NULL CHECK (pattern_type IN ('daily_rhythm', 'weekly_pattern', 'subject_distribution', 'time_of_day', 'cognitive_peaks')),
  pattern_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(3,2) DEFAULT 0.5,
  detected_at timestamptz DEFAULT now() NOT NULL,
  valid_until timestamptz
);

CREATE INDEX IF NOT EXISTS ai_cognitive_load_patterns_child_idx ON ai_cognitive_load_patterns(child_id);
CREATE INDEX IF NOT EXISTS ai_cognitive_load_patterns_type_idx ON ai_cognitive_load_patterns(pattern_type);

-- ============================================================
-- 5. AI Review Task Recommendations
-- ============================================================

-- Enhanced review task recommendations
CREATE TABLE IF NOT EXISTS ai_review_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('spaced_review', 'mastery_check', 'skill_practice', 'concept_reinforcement', 'assignment_review')),
  priority integer DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  title text NOT NULL,
  description text,
  reason text, -- Why this review is recommended
  linked_content_id uuid, -- Assignment, skill, subject, etc.
  linked_content_type text, -- 'assignment', 'skill', 'subject', 'event'
  estimated_benefit text,
  estimated_time_minutes integer,
  cognitive_load text DEFAULT 'medium' CHECK (cognitive_load IN ('low', 'medium', 'high')),
  optimal_timing jsonb, -- When this review should ideally happen
  spaced_repetition_data jsonb DEFAULT '{}'::jsonb, -- For spaced repetition algorithms
  mastery_level numeric(3,2), -- Current mastery estimate (0-1)
  target_mastery numeric(3,2), -- Target mastery level
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed', 'dismissed', 'expired')),
  ai_model text DEFAULT 'review_engine',
  created_at timestamptz DEFAULT now() NOT NULL,
  scheduled_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_review_recommendations_child_idx ON ai_review_recommendations(child_id);
CREATE INDEX IF NOT EXISTS ai_review_recommendations_status_idx ON ai_review_recommendations(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ai_review_recommendations_type_idx ON ai_review_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS ai_review_recommendations_priority_idx ON ai_review_recommendations(priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_review_recommendations_family_idx ON ai_review_recommendations(family_id);

-- Review task completion tracking
CREATE TABLE IF NOT EXISTS ai_review_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES ai_review_recommendations(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  completed_at timestamptz DEFAULT now() NOT NULL,
  actual_time_minutes integer,
  effectiveness_rating integer CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  notes text
);

CREATE INDEX IF NOT EXISTS ai_review_completions_recommendation_idx ON ai_review_completions(recommendation_id);
CREATE INDEX IF NOT EXISTS ai_review_completions_child_idx ON ai_review_completions(child_id);

-- ============================================================
-- 6. Row Level Security (RLS) Policies
-- ============================================================

-- AI Coach Sessions
ALTER TABLE ai_coach_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_coach_sessions_select" ON ai_coach_sessions;
CREATE POLICY "ai_coach_sessions_select" ON ai_coach_sessions
  FOR SELECT TO authenticated
  USING (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_coach_sessions_insert" ON ai_coach_sessions;
CREATE POLICY "ai_coach_sessions_insert" ON ai_coach_sessions
  FOR INSERT TO authenticated
  WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_coach_sessions_update" ON ai_coach_sessions;
CREATE POLICY "ai_coach_sessions_update" ON ai_coach_sessions
  FOR UPDATE TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

-- AI Coach Recommendations
ALTER TABLE ai_coach_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_coach_recommendations_select" ON ai_coach_recommendations;
CREATE POLICY "ai_coach_recommendations_select" ON ai_coach_recommendations
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM ai_coach_sessions WHERE is_family_member(family_id)));
DROP POLICY IF EXISTS "ai_coach_recommendations_insert" ON ai_coach_recommendations;
CREATE POLICY "ai_coach_recommendations_insert" ON ai_coach_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM ai_coach_sessions WHERE is_family_member(family_id)));
DROP POLICY IF EXISTS "ai_coach_recommendations_update" ON ai_coach_recommendations;
CREATE POLICY "ai_coach_recommendations_update" ON ai_coach_recommendations
  FOR UPDATE TO authenticated
  USING (session_id IN (SELECT id FROM ai_coach_sessions WHERE is_family_member(family_id)))
  WITH CHECK (session_id IN (SELECT id FROM ai_coach_sessions WHERE is_family_member(family_id)));

-- AI Insights
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_insights_select" ON ai_insights;
CREATE POLICY "ai_insights_select" ON ai_insights
  FOR SELECT TO authenticated
  USING (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_insights_insert" ON ai_insights;
CREATE POLICY "ai_insights_insert" ON ai_insights
  FOR INSERT TO authenticated
  WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_insights_update" ON ai_insights;
CREATE POLICY "ai_insights_update" ON ai_insights
  FOR UPDATE TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

-- AI Insight Generation Log
ALTER TABLE ai_insight_generation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_insight_generation_log_select" ON ai_insight_generation_log;
CREATE POLICY "ai_insight_generation_log_select" ON ai_insight_generation_log
  FOR SELECT TO authenticated
  USING (is_family_member(family_id));

-- AI Generated Templates
ALTER TABLE ai_generated_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_generated_templates_select" ON ai_generated_templates;
CREATE POLICY "ai_generated_templates_select" ON ai_generated_templates
  FOR SELECT TO authenticated
  USING (family_id IS NULL OR is_family_member(family_id) OR is_public = true);
DROP POLICY IF EXISTS "ai_generated_templates_insert" ON ai_generated_templates;
CREATE POLICY "ai_generated_templates_insert" ON ai_generated_templates
  FOR INSERT TO authenticated
  WITH CHECK (family_id IS NULL OR is_family_member(family_id));
DROP POLICY IF EXISTS "ai_generated_templates_update" ON ai_generated_templates;
CREATE POLICY "ai_generated_templates_update" ON ai_generated_templates
  FOR UPDATE TO authenticated
  USING (family_id IS NULL OR is_family_member(family_id))
  WITH CHECK (family_id IS NULL OR is_family_member(family_id));

-- AI Template Generation Queue
ALTER TABLE ai_template_generation_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_template_generation_queue_select" ON ai_template_generation_queue;
CREATE POLICY "ai_template_generation_queue_select" ON ai_template_generation_queue
  FOR SELECT TO authenticated
  USING (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_template_generation_queue_insert" ON ai_template_generation_queue;
CREATE POLICY "ai_template_generation_queue_insert" ON ai_template_generation_queue
  FOR INSERT TO authenticated
  WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_template_generation_queue_update" ON ai_template_generation_queue;
CREATE POLICY "ai_template_generation_queue_update" ON ai_template_generation_queue
  FOR UPDATE TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

-- AI Workload Analyses
ALTER TABLE ai_workload_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_workload_analyses_select" ON ai_workload_analyses;
CREATE POLICY "ai_workload_analyses_select" ON ai_workload_analyses
  FOR SELECT TO authenticated
  USING (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_workload_analyses_insert" ON ai_workload_analyses;
CREATE POLICY "ai_workload_analyses_insert" ON ai_workload_analyses
  FOR INSERT TO authenticated
  WITH CHECK (is_family_member(family_id));

-- AI Cognitive Load Patterns
ALTER TABLE ai_cognitive_load_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_cognitive_load_patterns_select" ON ai_cognitive_load_patterns;
CREATE POLICY "ai_cognitive_load_patterns_select" ON ai_cognitive_load_patterns
  FOR SELECT TO authenticated
  USING (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_cognitive_load_patterns_insert" ON ai_cognitive_load_patterns;
CREATE POLICY "ai_cognitive_load_patterns_insert" ON ai_cognitive_load_patterns
  FOR INSERT TO authenticated
  WITH CHECK (is_family_member(family_id));

-- AI Review Recommendations
ALTER TABLE ai_review_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_review_recommendations_select" ON ai_review_recommendations;
CREATE POLICY "ai_review_recommendations_select" ON ai_review_recommendations
  FOR SELECT TO authenticated
  USING (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_review_recommendations_insert" ON ai_review_recommendations;
CREATE POLICY "ai_review_recommendations_insert" ON ai_review_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS "ai_review_recommendations_update" ON ai_review_recommendations;
CREATE POLICY "ai_review_recommendations_update" ON ai_review_recommendations
  FOR UPDATE TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

-- AI Review Completions
ALTER TABLE ai_review_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_review_completions_select" ON ai_review_completions;
CREATE POLICY "ai_review_completions_select" ON ai_review_completions
  FOR SELECT TO authenticated
  USING (recommendation_id IN (SELECT id FROM ai_review_recommendations WHERE is_family_member(family_id)));
DROP POLICY IF EXISTS "ai_review_completions_insert" ON ai_review_completions;
CREATE POLICY "ai_review_completions_insert" ON ai_review_completions
  FOR INSERT TO authenticated
  WITH CHECK (recommendation_id IN (SELECT id FROM ai_review_recommendations WHERE is_family_member(family_id)));

-- ============================================================
-- 7. Helper Functions
-- ============================================================

-- Function to get or create coach session
CREATE OR REPLACE FUNCTION get_or_create_coach_session(
  p_family_id uuid,
  p_session_type text,
  p_user_id uuid DEFAULT NULL,
  p_child_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Try to find existing active session
  SELECT id INTO v_session_id
  FROM ai_coach_sessions
  WHERE family_id = p_family_id
    AND session_type = p_session_type
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_child_id IS NULL OR child_id = p_child_id)
    AND last_interaction_at > now() - interval '24 hours'
  ORDER BY last_interaction_at DESC
  LIMIT 1;
  
  -- If no active session, create new one
  IF v_session_id IS NULL THEN
    INSERT INTO ai_coach_sessions (family_id, user_id, child_id, session_type)
    VALUES (p_family_id, p_user_id, p_child_id, p_session_type)
    RETURNING id INTO v_session_id;
  END IF;
  
  RETURN v_session_id;
END;
$$;

-- Function to calculate cognitive load balance score
CREATE OR REPLACE FUNCTION calculate_workload_balance_score(
  p_daily_loads jsonb,
  p_target_load text DEFAULT 'medium'
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_score integer;
  v_variance numeric;
  v_total_variance numeric := 0;
  v_day_count integer := 0;
  v_load_value integer;
  v_day_key text;
BEGIN
  -- Map target load to score
  v_target_score := CASE p_target_load
    WHEN 'low' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'high' THEN 3
    ELSE 2
  END;
  
  -- Calculate variance for each day
  FOR v_day_key, v_load_value IN SELECT * FROM jsonb_each(p_daily_loads)
  LOOP
    v_variance := abs((v_load_value->>'total_load')::integer - v_target_score);
    v_total_variance := v_total_variance + v_variance;
    v_day_count := v_day_count + 1;
  END LOOP;
  
  -- Normalize to 0-1 score (lower variance = higher score)
  IF v_day_count > 0 THEN
    RETURN GREATEST(0, 1 - (v_total_variance / (v_day_count * 2.0)));
  END IF;
  
  RETURN 0.5; -- Default neutral score
END;
$$;

