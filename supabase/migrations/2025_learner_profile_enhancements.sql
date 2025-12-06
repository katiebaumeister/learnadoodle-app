-- Learner Profile Enhancements: Sensory-friendly color modes, Strengths/Interests profile, 
-- Comprehensive learner profile, and Personalized recommendations
-- Adds missing features for comprehensive learner support

-- ============================================================
-- 1. Add sensory-friendly color modes to child_support_profiles
-- ============================================================

-- Add color_mode column to child_support_profiles
ALTER TABLE child_support_profiles
ADD COLUMN IF NOT EXISTS color_mode TEXT CHECK (color_mode IN ('default', 'high_contrast', 'low_contrast', 'colorblind_friendly', 'dyslexia_friendly', 'autism_friendly'));

-- Add color_preferences JSONB for custom color settings
ALTER TABLE child_support_profiles
ADD COLUMN IF NOT EXISTS color_preferences JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN child_support_profiles.color_mode IS 'Sensory-friendly color mode preference (default, high_contrast, low_contrast, colorblind_friendly, dyslexia_friendly, autism_friendly)';
COMMENT ON COLUMN child_support_profiles.color_preferences IS 'Custom color preferences including background, text, accent colors, and contrast settings';

-- ============================================================
-- 2. Create child_learner_profile table for comprehensive learner profile
-- ============================================================

CREATE TABLE IF NOT EXISTS child_learner_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    -- Strengths and interests
    strengths TEXT[] DEFAULT '{}',  -- Array of strengths (e.g., "Strong problem-solving", "Creative thinking")
    interests TEXT[] DEFAULT '{}',  -- Array of interests (e.g., "STEM", "Reading", "Arts")
    learning_preferences JSONB DEFAULT '{}'::jsonb,  -- Preferred learning times, environments, etc.
    -- Academic profile
    academic_strengths TEXT[] DEFAULT '{}',  -- Subject-specific strengths
    academic_challenges TEXT[] DEFAULT '{}',  -- Areas needing support
    preferred_subjects TEXT[] DEFAULT '{}',  -- Favorite subjects
    -- Social and emotional
    social_preferences JSONB DEFAULT '{}'::jsonb,  -- Group work preferences, social needs
    motivation_factors TEXT[] DEFAULT '{}',  -- What motivates the learner
    -- Learning history and patterns
    learning_patterns JSONB DEFAULT '{}'::jsonb,  -- Patterns in learning (best times, most effective methods)
    progress_notes TEXT,  -- Notes on overall progress and development
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(child_id)
);

CREATE INDEX IF NOT EXISTS idx_learner_profile_child ON child_learner_profile(child_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_learner_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_learner_profile_updated_at
    BEFORE UPDATE ON child_learner_profile
    FOR EACH ROW
    EXECUTE FUNCTION update_learner_profile_updated_at();

-- ============================================================
-- 3. Create personalized_recommendations table
-- ============================================================

CREATE TABLE IF NOT EXISTS personalized_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    -- Recommendation details
    recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
        'learning_strategy', 
        'resource', 
        'schedule_adjustment', 
        'subject_suggestion',
        'activity_suggestion',
        'support_strategy',
        'goal_setting',
        'skill_development'
    )),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    rationale TEXT,  -- Why this recommendation is made
    -- Linked content
    linked_content_type TEXT,  -- 'subject', 'assignment', 'event', 'resource', etc.
    linked_content_id UUID,  -- ID of linked content if applicable
    -- Recommendation metadata
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    confidence_score NUMERIC(3, 2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    estimated_benefit TEXT,  -- Expected benefit from following this recommendation
    estimated_time_minutes INTEGER,  -- Time investment if applicable
    cognitive_load TEXT CHECK (cognitive_load IN ('low', 'medium', 'high')),
    -- Profile factors that influenced this recommendation
    influenced_by JSONB DEFAULT '{}'::jsonb,  -- Which profile factors led to this (strengths, interests, diagnoses, etc.)
    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'completed', 'snoozed')),
    accepted_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    snoozed_until TIMESTAMPTZ,
    -- User feedback
    user_feedback TEXT,  -- User notes on the recommendation
    user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)  -- System or user who created this
);

CREATE INDEX IF NOT EXISTS idx_recommendations_family ON personalized_recommendations(family_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_child ON personalized_recommendations(child_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON personalized_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON personalized_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_priority ON personalized_recommendations(priority DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_created ON personalized_recommendations(created_at DESC);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_recommendations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_recommendations_updated_at
    BEFORE UPDATE ON personalized_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_recommendations_updated_at();

-- ============================================================
-- 4. RLS Policies
-- ============================================================

-- Enable RLS
ALTER TABLE child_learner_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalized_recommendations ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user can access child (reuse existing if available)
-- CREATE OR REPLACE will create if it doesn't exist or replace if it does
CREATE OR REPLACE FUNCTION can_access_child(_child_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM children c
        JOIN profiles p ON c.family_id = p.family_id
        WHERE c.id = _child_id
        AND p.id = auth.uid()
    );
$$;

-- child_learner_profile policies
DROP POLICY IF EXISTS learner_profile_select ON child_learner_profile;
CREATE POLICY learner_profile_select ON child_learner_profile
    FOR SELECT
    USING (can_access_child(child_id));

DROP POLICY IF EXISTS learner_profile_insert ON child_learner_profile;
CREATE POLICY learner_profile_insert ON child_learner_profile
    FOR INSERT
    WITH CHECK (can_access_child(child_id));

DROP POLICY IF EXISTS learner_profile_update ON child_learner_profile;
CREATE POLICY learner_profile_update ON child_learner_profile
    FOR UPDATE
    USING (can_access_child(child_id))
    WITH CHECK (can_access_child(child_id));

DROP POLICY IF EXISTS learner_profile_delete ON child_learner_profile;
CREATE POLICY learner_profile_delete ON child_learner_profile
    FOR DELETE
    USING (can_access_child(child_id));

-- personalized_recommendations policies
DROP POLICY IF EXISTS recommendations_select ON personalized_recommendations;
CREATE POLICY recommendations_select ON personalized_recommendations
    FOR SELECT
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        AND can_access_child(child_id)
    );

DROP POLICY IF EXISTS recommendations_insert ON personalized_recommendations;
CREATE POLICY recommendations_insert ON personalized_recommendations
    FOR INSERT
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        AND can_access_child(child_id)
    );

DROP POLICY IF EXISTS recommendations_update ON personalized_recommendations;
CREATE POLICY recommendations_update ON personalized_recommendations
    FOR UPDATE
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS recommendations_delete ON personalized_recommendations;
CREATE POLICY recommendations_delete ON personalized_recommendations
    FOR DELETE
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- ============================================================
-- 5. Helper function to get comprehensive learner profile
-- ============================================================

CREATE OR REPLACE FUNCTION get_comprehensive_learner_profile(_child_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_profile JSONB;
    v_support_profile JSONB;
    v_learner_profile JSONB;
BEGIN
    -- Get support profile
    SELECT to_jsonb(sp.*) INTO v_support_profile
    FROM child_support_profiles sp
    WHERE sp.child_id = _child_id;
    
    -- Get learner profile
    SELECT to_jsonb(lp.*) INTO v_learner_profile
    FROM child_learner_profile lp
    WHERE lp.child_id = _child_id;
    
    -- Combine into comprehensive profile
    v_profile := jsonb_build_object(
        'child_id', _child_id,
        'support_profile', COALESCE(v_support_profile, '{}'::jsonb),
        'learner_profile', COALESCE(v_learner_profile, '{}'::jsonb),
        'comprehensive', true
    );
    
    RETURN v_profile;
END;
$$;

-- ============================================================
-- 6. Comments for documentation
-- ============================================================

COMMENT ON TABLE child_learner_profile IS 'Comprehensive learner profile including strengths, interests, academic profile, and learning preferences';
COMMENT ON COLUMN child_learner_profile.strengths IS 'Array of learner strengths (e.g., "Strong problem-solving", "Creative thinking")';
COMMENT ON COLUMN child_learner_profile.interests IS 'Array of learner interests (e.g., "STEM", "Reading", "Arts")';
COMMENT ON COLUMN child_learner_profile.learning_preferences IS 'JSONB field for learning preferences (preferred times, environments, etc.)';
COMMENT ON COLUMN child_learner_profile.academic_strengths IS 'Subject-specific academic strengths';
COMMENT ON COLUMN child_learner_profile.academic_challenges IS 'Areas needing academic support';
COMMENT ON COLUMN child_learner_profile.preferred_subjects IS 'Favorite or preferred subjects';
COMMENT ON COLUMN child_learner_profile.social_preferences IS 'Social learning preferences (group work, individual, etc.)';
COMMENT ON COLUMN child_learner_profile.motivation_factors IS 'What motivates the learner';
COMMENT ON COLUMN child_learner_profile.learning_patterns IS 'Patterns in learning effectiveness (best times, methods, etc.)';

COMMENT ON TABLE personalized_recommendations IS 'AI-powered personalized learning recommendations based on learner profile';
COMMENT ON COLUMN personalized_recommendations.recommendation_type IS 'Type of recommendation (learning_strategy, resource, schedule_adjustment, etc.)';
COMMENT ON COLUMN personalized_recommendations.rationale IS 'Explanation of why this recommendation is made';
COMMENT ON COLUMN personalized_recommendations.influenced_by IS 'JSONB field indicating which profile factors influenced this recommendation';
COMMENT ON COLUMN personalized_recommendations.confidence_score IS 'AI confidence score (0.0 to 1.0) for this recommendation';
COMMENT ON COLUMN personalized_recommendations.cognitive_load IS 'Expected cognitive load (low, medium, high)';
COMMENT ON COLUMN personalized_recommendations.status IS 'Status: pending, accepted, dismissed, completed, snoozed';

