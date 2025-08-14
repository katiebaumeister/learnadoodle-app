-- Fix Calendar Tables - Diagnostic and Creation Script
-- This script will check what exists and create missing tables

-- First, let's see what tables exist
SELECT 'EXISTING TABLES:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY table_name;

-- Check if academic_years table exists and its structure
SELECT 'ACADEMIC_YEARS STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'academic_years' 
ORDER BY ordinal_position;

-- Create academic_years table if it doesn't exist
CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    year_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER,
    total_hours INTEGER,
    hours_per_day FLOAT,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create typical_holidays table if it doesn't exist
CREATE TABLE IF NOT EXISTS typical_holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    holiday_name TEXT NOT NULL,
    holiday_type TEXT NOT NULL CHECK (holiday_type IN ('fixed', 'floating', 'variable', 'range')),
    month INTEGER CHECK (month >= 1 AND month <= 12),
    day INTEGER CHECK (day >= 1 AND day <= 31),
    rule TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create holidays table if it doesn't exist
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    holiday_name TEXT NOT NULL,
    holiday_date DATE NOT NULL,
    is_proposed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create class_days table if it doesn't exist
CREATE TABLE IF NOT EXISTS class_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, day_of_week)
);

-- Create class_day_mappings table if it doesn't exist
CREATE TABLE IF NOT EXISTS class_day_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_date DATE NOT NULL,
    class_day_number INTEGER,
    is_vacation BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, class_date)
);

-- Create lessons table if it doesn't exist
CREATE TABLE IF NOT EXISTS lessons (
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

-- Create attendance table if it doesn't exist
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    attended BOOLEAN NOT NULL,
    notes TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(child_id, attendance_date)
);

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_academic_years_family_id ON academic_years(family_id);
CREATE INDEX IF NOT EXISTS idx_academic_years_is_current ON academic_years(is_current);
CREATE INDEX IF NOT EXISTS idx_holidays_academic_year_id ON holidays(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_class_days_academic_year_id ON class_days(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_class_day_mappings_academic_year_id ON class_day_mappings(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_class_day_mappings_date ON class_day_mappings(class_date);
CREATE INDEX IF NOT EXISTS idx_lessons_academic_year_id ON lessons(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(lesson_date);
CREATE INDEX IF NOT EXISTS idx_attendance_child_id ON attendance(child_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);

-- Insert typical holidays if they don't exist
INSERT INTO typical_holidays (holiday_name, holiday_type, month, day) VALUES
('New Year''s Day', 'fixed', 1, 1),
('Martin Luther King Jr. Day', 'floating', 1, NULL),
('Presidents'' Day', 'floating', 2, NULL),
('Memorial Day', 'floating', 5, NULL),
('Independence Day', 'fixed', 7, 4),
('Labor Day', 'floating', 9, NULL),
('Columbus Day', 'floating', 10, NULL),
('Veterans Day', 'fixed', 11, 11),
('Thanksgiving Day', 'floating', 11, NULL),
('Christmas Day', 'fixed', 12, 25)
ON CONFLICT DO NOTHING;

-- Show final table structure
SELECT 'FINAL TABLE STRUCTURE:' as info;
SELECT table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY table_name, ordinal_position;

SELECT 'Calendar tables setup completed!' as status; 