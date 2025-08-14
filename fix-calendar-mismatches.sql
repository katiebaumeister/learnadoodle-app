-- Fix Calendar Table Mismatches
-- This script fixes the column name mismatches between existing tables and expected structure

-- 1. Fix class_days table - rename family_year_id to academic_year_id
ALTER TABLE class_days 
RENAME COLUMN family_year_id TO academic_year_id;

-- 2. Add missing columns to class_days table
ALTER TABLE class_days 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Add unique constraint to class_days if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'class_days_academic_year_id_day_of_week_key'
    ) THEN
        ALTER TABLE class_days 
        ADD CONSTRAINT class_days_academic_year_id_day_of_week_key 
        UNIQUE (academic_year_id, day_of_week);
    END IF;
END $$;

-- 4. Fix attendance table - completely recreate it with correct structure
-- First, backup existing attendance data
CREATE TABLE IF NOT EXISTS attendance_backup AS SELECT * FROM attendance;

-- Drop the existing attendance table (this will drop all policies and dependencies)
DROP TABLE IF EXISTS attendance CASCADE;

-- Create the new attendance table with the correct structure
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    attended BOOLEAN NOT NULL,
    notes TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(child_id, attendance_date)
);

-- 5. Fix lessons table - we need to create a new structure
-- First, let's backup the existing lessons data
CREATE TABLE IF NOT EXISTS lessons_backup AS SELECT * FROM lessons;

-- Drop the existing lessons table
DROP TABLE IF EXISTS lessons;

-- Create the new lessons table with the correct structure
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL,
    lesson_number INTEGER NOT NULL CHECK (lesson_number >= 1 AND lesson_number <= 365),
    lesson_date DATE,
    content_summary TEXT,
    content_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, subject_name, lesson_number)
);

-- 6. Add missing indexes
CREATE INDEX IF NOT EXISTS idx_class_days_academic_year_id ON class_days(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_attendance_child_id ON attendance(child_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_lessons_academic_year_id ON lessons(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(lesson_date);

-- 7. Enable RLS on tables that might not have it
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for class_days
DROP POLICY IF EXISTS "Users can view their family's class days" ON class_days;
CREATE POLICY "Users can view their family's class days" ON class_days
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert their family's class days" ON class_days;
CREATE POLICY "Users can insert their family's class days" ON class_days
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update their family's class days" ON class_days;
CREATE POLICY "Users can update their family's class days" ON class_days
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can delete their family's class days" ON class_days;
CREATE POLICY "Users can delete their family's class days" ON class_days
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- 9. Create RLS policies for attendance
DROP POLICY IF EXISTS "Users can view their family's attendance" ON attendance;
CREATE POLICY "Users can view their family's attendance" ON attendance
    FOR SELECT USING (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert their family's attendance" ON attendance;
CREATE POLICY "Users can insert their family's attendance" ON attendance
    FOR INSERT WITH CHECK (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update their family's attendance" ON attendance;
CREATE POLICY "Users can update their family's attendance" ON attendance
    FOR UPDATE USING (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can delete their family's attendance" ON attendance;
CREATE POLICY "Users can delete their family's attendance" ON attendance
    FOR DELETE USING (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- 10. Create RLS policies for lessons
DROP POLICY IF EXISTS "Users can view their family's lessons" ON lessons;
CREATE POLICY "Users can view their family's lessons" ON lessons
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert their family's lessons" ON lessons;
CREATE POLICY "Users can insert their family's lessons" ON lessons
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update their family's lessons" ON lessons;
CREATE POLICY "Users can update their family's lessons" ON lessons
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can delete their family's lessons" ON lessons;
CREATE POLICY "Users can delete their family's lessons" ON lessons
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Show the final structure
SELECT 'FINAL TABLE STRUCTURE AFTER FIXES:' as info;
SELECT table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY table_name, ordinal_position;

SELECT 'Calendar table mismatches fixed successfully!' as status; 