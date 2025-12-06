-- ============================================================
-- System Validation & Improvements
-- Addresses final validation checklist and adds enhancements
-- ============================================================

-- ============================================================
-- PART 1: VALIDATION CHECKS & FIXES
-- ============================================================

-- 1.1 Event → Task Link Verification
-- Check that events have year_plan_id for curriculum-based events
-- (Note: This system uses year_plan_id, not task_id)

-- Create a view to identify events that should have task links but don't
CREATE OR REPLACE VIEW events_missing_task_links AS
SELECT 
    e.id,
    e.title,
    e.start_ts,
    e.source,
    e.year_plan_id,
    CASE 
        WHEN e.source IN ('ai', 'year_plan_seed') AND e.year_plan_id IS NULL THEN 'MISSING'
        WHEN e.source = 'manual' AND e.year_plan_id IS NULL THEN 'OK (manual)'
        ELSE 'OK'
    END AS link_status
FROM events e
WHERE e.status != 'canceled'
ORDER BY e.start_ts DESC;

COMMENT ON VIEW events_missing_task_links IS 'Identifies events that should have year_plan_id but are missing it';

-- 1.2 Backlog Deletion Safety - Add resolved_at for audit trail
-- Handle both 'backlog' and 'backlog_items' tables
DO $$ 
BEGIN
    -- Try backlog table first
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog') THEN
        ALTER TABLE backlog ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_backlog_resolved_at ON backlog(resolved_at) WHERE resolved_at IS NOT NULL;
        COMMENT ON COLUMN backlog.resolved_at IS 'Timestamp when backlog item was resolved (scheduled or dismissed). Enables audit trail and lifecycle tracking.';
    END IF;
    
    -- Also try backlog_items table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog_items') THEN
        ALTER TABLE backlog_items ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_backlog_items_resolved_at ON backlog_items(resolved_at) WHERE resolved_at IS NOT NULL;
        COMMENT ON COLUMN backlog_items.resolved_at IS 'Timestamp when backlog item was resolved (scheduled or dismissed). Enables audit trail and lifecycle tracking.';
    END IF;
END $$;

-- 1.3 Schedule Overrides Enhancement - Add explicit start/end override columns
ALTER TABLE schedule_overrides
ADD COLUMN IF NOT EXISTS start_override TIME,
ADD COLUMN IF NOT EXISTS end_override TIME;

COMMENT ON COLUMN schedule_overrides.start_override IS 'Explicit start time override for partial days (overrides first_block_start)';
COMMENT ON COLUMN schedule_overrides.end_override IS 'Explicit end time override for partial days (overrides last_block_end)';

-- 1.4 Cache Refresh Verification Function
-- Creates a function to verify cache correctness
CREATE OR REPLACE FUNCTION verify_calendar_cache(
    p_family_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    date DATE,
    child_id UUID,
    day_status TEXT,
    has_blackout BOOLEAN,
    has_override BOOLEAN,
    cache_status TEXT,
    issues TEXT[]
)
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_issue TEXT;
BEGIN
    RETURN QUERY
    WITH cache_entries AS (
        SELECT 
            cdc.date,
            cdc.child_id,
            cdc.day_status,
            cdc.first_block_start,
            cdc.last_block_end
        FROM calendar_days_cache cdc
        WHERE cdc.family_id = p_family_id
            AND cdc.date BETWEEN p_start_date AND p_end_date
    ),
    blackout_check AS (
        SELECT DISTINCT
            bp.start_date,
            bp.end_date,
            bp.child_id,
            bp.family_id
        FROM blackout_periods bp
        WHERE bp.family_id = p_family_id
            AND bp.start_date <= p_end_date
            AND bp.end_date >= p_start_date
            AND bp.is_active = true
    ),
    override_check AS (
        SELECT DISTINCT
            so.date,
            so.scope_id AS child_id,
            so.override_kind
        FROM schedule_overrides so
        WHERE so.family_id = p_family_id
            AND so.date BETWEEN p_start_date AND p_end_date
            AND so.is_active = true
            AND so.scope_type = 'child'
    )
    SELECT 
        ce.date,
        ce.child_id,
        ce.day_status,
        CASE WHEN EXISTS (
            SELECT 1 FROM blackout_check bc
            WHERE ce.date BETWEEN bc.start_date AND bc.end_date
                AND (bc.child_id IS NULL OR bc.child_id = ce.child_id)
        ) THEN true ELSE false END AS has_blackout,
        CASE WHEN EXISTS (
            SELECT 1 FROM override_check oc
            WHERE oc.date = ce.date AND oc.child_id = ce.child_id
        ) THEN true ELSE false END AS has_override,
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM blackout_check bc
                WHERE ce.date BETWEEN bc.start_date AND bc.end_date
                    AND (bc.child_id IS NULL OR bc.child_id = ce.child_id)
            ) AND ce.day_status != 'off' THEN 'MISMATCH: Should be off'
            WHEN NOT EXISTS (
                SELECT 1 FROM blackout_check bc
                WHERE ce.date BETWEEN bc.start_date AND bc.end_date
                    AND (bc.child_id IS NULL OR bc.child_id = ce.child_id)
            ) AND ce.day_status = 'off' THEN 'MISMATCH: Should not be off'
            ELSE 'OK'
        END AS cache_status,
        ARRAY[]::TEXT[] AS issues
    FROM cache_entries ce
    ORDER BY ce.date, ce.child_id;
END;
$$;

COMMENT ON FUNCTION verify_calendar_cache IS 'Verifies calendar_days_cache correctness against blackouts and overrides';

GRANT EXECUTE ON FUNCTION verify_calendar_cache(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- PART 2: NEXT-LEVEL ENHANCEMENTS
-- ============================================================

-- 2.1 Priority Queue Support
-- Add priority column to backlog (already exists in some schemas, but ensure it's there)
DO $$ 
BEGIN
    -- Try backlog table first
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog') THEN
        ALTER TABLE backlog ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_backlog_priority ON backlog(priority, created_at) WHERE resolved_at IS NULL;
        COMMENT ON COLUMN backlog.priority IS 'Priority for rescheduling: higher = more urgent. Based on due date, subject velocity, streak dependence, etc.';
    END IF;
    
    -- Also try backlog_items table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog_items') THEN
        ALTER TABLE backlog_items ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_backlog_items_priority ON backlog_items(priority, created_at) WHERE resolved_at IS NULL;
    END IF;
END $$;

-- 2.2 Task Splitting Support
-- Add columns to backlog for splitting rules
DO $$ 
BEGIN
    -- Try backlog table first
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog') THEN
        ALTER TABLE backlog ADD COLUMN IF NOT EXISTS min_session_length INT;
        ALTER TABLE backlog ADD COLUMN IF NOT EXISTS max_sessions INT;
        COMMENT ON COLUMN backlog.min_session_length IS 'Minimum session length in minutes (for splitting)';
        COMMENT ON COLUMN backlog.max_sessions IS 'Maximum number of sessions this task can be split into';
    END IF;
    
    -- Also try backlog_items table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog_items') THEN
        ALTER TABLE backlog_items ADD COLUMN IF NOT EXISTS min_session_length INT;
        ALTER TABLE backlog_items ADD COLUMN IF NOT EXISTS max_sessions INT;
    END IF;
END $$;

-- If tasks table exists, add there too
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS min_session_length INT;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_sessions INT;
    END IF;
END $$;

-- 2.3 Day Theme Awareness
CREATE TABLE IF NOT EXISTS day_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    weekday INT NOT NULL CHECK (weekday >= 0 AND weekday <= 6), -- 0=Monday, 6=Sunday
    subject_ids UUID[] DEFAULT '{}',
    theme_name TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (child_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_day_themes_child ON day_themes(child_id, weekday) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_day_themes_family ON day_themes(family_id);

COMMENT ON TABLE day_themes IS 'Day-of-week themes for scheduling optimization (e.g., Monday=Writing, Tuesday=Science)';

-- 2.4 Emotional + Cognitive Load Awareness
-- Add columns to children table for load tracking
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'children') THEN
        -- Add cognitive load preferences
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'children' AND column_name = 'preferred_heavy_subject_time') THEN
            ALTER TABLE children ADD COLUMN preferred_heavy_subject_time TEXT CHECK (preferred_heavy_subject_time IN ('morning', 'afternoon', 'flexible'));
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'children' AND column_name = 'max_daily_heavy_subjects') THEN
            ALTER TABLE children ADD COLUMN max_daily_heavy_subjects INT DEFAULT 2;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'children' AND column_name = 'low_energy_periods') THEN
            ALTER TABLE children ADD COLUMN low_energy_periods TEXT[] DEFAULT '{}';
        END IF;
        
        COMMENT ON COLUMN children.preferred_heavy_subject_time IS 'Preferred time for heavy cognitive load subjects (morning/afternoon/flexible)';
        COMMENT ON COLUMN children.max_daily_heavy_subjects IS 'Maximum number of heavy subjects per day';
        COMMENT ON COLUMN children.low_energy_periods IS 'Time periods when child has lower energy (e.g., ["afternoon", "late_morning"])';
    END IF;
END $$;

-- Create subject load classification table
CREATE TABLE IF NOT EXISTS subject_cognitive_load (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    load_level TEXT NOT NULL CHECK (load_level IN ('light', 'medium', 'heavy')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (subject_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_cognitive_load_subject ON subject_cognitive_load(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_cognitive_load_family ON subject_cognitive_load(family_id);

COMMENT ON TABLE subject_cognitive_load IS 'Cognitive load classification for subjects (used for scheduling optimization)';

-- 2.5 Catch-Up Mode Support
-- Add catch_up_mode flag to backlog items
DO $$ 
BEGIN
    -- Try backlog table first
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog') THEN
        ALTER TABLE backlog ADD COLUMN IF NOT EXISTS catch_up_mode BOOLEAN DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_backlog_catch_up ON backlog(catch_up_mode, priority) WHERE catch_up_mode = true AND resolved_at IS NULL;
        COMMENT ON COLUMN backlog.catch_up_mode IS 'Flag indicating this task is in catch-up mode (overdue, reduced session length, spread across days)';
    END IF;
    
    -- Also try backlog_items table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backlog_items') THEN
        ALTER TABLE backlog_items ADD COLUMN IF NOT EXISTS catch_up_mode BOOLEAN DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_backlog_items_catch_up ON backlog_items(catch_up_mode, priority) WHERE catch_up_mode = true AND resolved_at IS NULL;
    END IF;
END $$;

-- ============================================================
-- PART 3: HELPER FUNCTIONS FOR VALIDATION
-- ============================================================

-- Function to check for events missing year_plan_id
CREATE OR REPLACE FUNCTION check_events_missing_links(
    p_family_id UUID DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    title TEXT,
    start_ts TIMESTAMPTZ,
    source TEXT,
    year_plan_id UUID,
    status TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        e.id AS event_id,
        e.title,
        e.start_ts,
        e.source,
        e.year_plan_id,
        CASE 
            WHEN e.source IN ('ai', 'year_plan_seed') AND e.year_plan_id IS NULL THEN 'MISSING LINK'
            ELSE 'OK'
        END AS status
    FROM events e
    WHERE (p_family_id IS NULL OR e.family_id = p_family_id)
        AND e.status != 'canceled'
        AND e.source IN ('ai', 'year_plan_seed')
        AND e.year_plan_id IS NULL
    ORDER BY e.start_ts DESC
    LIMIT 30;
$$;

COMMENT ON FUNCTION check_events_missing_links IS 'Returns events that should have year_plan_id but are missing it';

GRANT EXECUTE ON FUNCTION check_events_missing_links(UUID) TO authenticated;

-- ============================================================
-- PART 4: RLS POLICIES FOR NEW TABLES
-- ============================================================

-- Day themes RLS
ALTER TABLE day_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_themes_select ON day_themes
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY day_themes_insert ON day_themes
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY day_themes_update ON day_themes
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY day_themes_delete ON day_themes
    FOR DELETE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Subject cognitive load RLS
ALTER TABLE subject_cognitive_load ENABLE ROW LEVEL SECURITY;

CREATE POLICY subject_cognitive_load_select ON subject_cognitive_load
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY subject_cognitive_load_insert ON subject_cognitive_load
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY subject_cognitive_load_update ON subject_cognitive_load
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY subject_cognitive_load_delete ON subject_cognitive_load
    FOR DELETE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- ============================================================
-- PART 5: GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON day_themes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON subject_cognitive_load TO authenticated;

