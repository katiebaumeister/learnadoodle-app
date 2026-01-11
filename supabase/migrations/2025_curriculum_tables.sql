-- Curriculum Builder Tables
-- Supports creating structured curriculum units with lessons and pacing

-- curriculum_units table
CREATE TABLE IF NOT EXISTS curriculum_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    created_by_uid TEXT NOT NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('topic', 'syllabus', 'pdf', 'link', 'material')),
    source_ref TEXT, -- file id or url
    grade_band TEXT,
    subject_tags TEXT[] DEFAULT '{}',
    student_ids UUID[] DEFAULT '{}',
    total_minutes_est INTEGER DEFAULT 0,
    weeks_est INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_units_family_id ON curriculum_units(family_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_units_created_at ON curriculum_units(created_at DESC);

-- curriculum_lessons table
CREATE TABLE IF NOT EXISTS curriculum_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
    sequence_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    objective TEXT,
    minutes_est INTEGER NOT NULL DEFAULT 60,
    modality TEXT NOT NULL CHECK (modality IN ('reading', 'video', 'hands_on', 'discussion', 'practice', 'quiz', 'project')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('gentle', 'standard', 'stretch')),
    materials JSONB DEFAULT '[]',
    assessment JSONB DEFAULT '{}',
    prereqs TEXT[] DEFAULT '{}',
    links JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(unit_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_unit_id ON curriculum_lessons(unit_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_sequence ON curriculum_lessons(unit_id, sequence_index);

-- curriculum_pacing table
CREATE TABLE IF NOT EXISTS curriculum_pacing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    strategy TEXT NOT NULL,
    schedule_map JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_pacing_unit_id ON curriculum_pacing(unit_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_pacing_start_date ON curriculum_pacing(start_date);

-- Add curriculum_lesson_id to events table (nullable FK)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'curriculum_lesson_id'
    ) THEN
        ALTER TABLE events ADD COLUMN curriculum_lesson_id UUID REFERENCES curriculum_lessons(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_events_curriculum_lesson_id ON events(curriculum_lesson_id);
    END IF;
END $$;

-- RLS Policies
ALTER TABLE curriculum_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_pacing ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS curriculum_units_select ON curriculum_units;
DROP POLICY IF EXISTS curriculum_units_insert ON curriculum_units;
DROP POLICY IF EXISTS curriculum_units_update ON curriculum_units;
DROP POLICY IF EXISTS curriculum_units_delete ON curriculum_units;

DROP POLICY IF EXISTS curriculum_lessons_select ON curriculum_lessons;
DROP POLICY IF EXISTS curriculum_lessons_insert ON curriculum_lessons;
DROP POLICY IF EXISTS curriculum_lessons_update ON curriculum_lessons;
DROP POLICY IF EXISTS curriculum_lessons_delete ON curriculum_lessons;

DROP POLICY IF EXISTS curriculum_pacing_select ON curriculum_pacing;
DROP POLICY IF EXISTS curriculum_pacing_insert ON curriculum_pacing;
DROP POLICY IF EXISTS curriculum_pacing_update ON curriculum_pacing;
DROP POLICY IF EXISTS curriculum_pacing_delete ON curriculum_pacing;

-- RLS Policies for curriculum_units
CREATE POLICY curriculum_units_select ON curriculum_units
    FOR SELECT USING (is_family_member(family_id));

CREATE POLICY curriculum_units_insert ON curriculum_units
    FOR INSERT WITH CHECK (is_family_member(family_id));

CREATE POLICY curriculum_units_update ON curriculum_units
    FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

CREATE POLICY curriculum_units_delete ON curriculum_units
    FOR DELETE USING (is_family_member(family_id));

-- RLS Policies for curriculum_lessons (via unit)
CREATE POLICY curriculum_lessons_select ON curriculum_lessons
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_lessons.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

CREATE POLICY curriculum_lessons_insert ON curriculum_lessons
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_lessons.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

CREATE POLICY curriculum_lessons_update ON curriculum_lessons
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_lessons.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

CREATE POLICY curriculum_lessons_delete ON curriculum_lessons
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_lessons.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

-- RLS Policies for curriculum_pacing (via unit)
CREATE POLICY curriculum_pacing_select ON curriculum_pacing
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_pacing.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

CREATE POLICY curriculum_pacing_insert ON curriculum_pacing
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_pacing.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

CREATE POLICY curriculum_pacing_update ON curriculum_pacing
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_pacing.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

CREATE POLICY curriculum_pacing_delete ON curriculum_pacing
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM curriculum_units 
            WHERE curriculum_units.id = curriculum_pacing.unit_id 
            AND is_family_member(curriculum_units.family_id)
        )
    );

-- Grant explicit permissions to service_role (backend uses service role key)
-- This ensures the backend can insert/update/delete even with RLS enabled
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_units TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_lessons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_pacing TO service_role;

-- Grant usage on sequences (for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;


