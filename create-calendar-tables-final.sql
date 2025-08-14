-- Create Calendar Tables - Final Version
-- This script will create all calendar tables with proper structure

-- 1. Create academic_years table
CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL,
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

-- 2. Create typical_holidays table
CREATE TABLE IF NOT EXISTS typical_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holiday_name TEXT NOT NULL,
    holiday_type TEXT NOT NULL,
    month INTEGER,
    day INTEGER,
    rule TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create holidays table
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL,
    holiday_name TEXT NOT NULL,
    holiday_date DATE NOT NULL,
    is_proposed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create class_days table
CREATE TABLE IF NOT EXISTS class_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL,
    day_of_week INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, day_of_week)
);

-- 5. Create class_day_mappings table
CREATE TABLE IF NOT EXISTS class_day_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL,
    class_date DATE NOT NULL,
    class_day_number INTEGER,
    is_vacation BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, class_date)
);

-- 6. Create lessons table
CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL,
    subject_name TEXT NOT NULL,
    lesson_number INTEGER NOT NULL,
    lesson_date DATE,
    content_summary TEXT,
    content_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, subject_name, lesson_number)
);

-- 7. Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL,
    attendance_date DATE NOT NULL,
    attended BOOLEAN NOT NULL,
    notes TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(child_id, attendance_date)
);

-- 8. Ensure RLS is disabled on all tables
ALTER TABLE academic_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE typical_holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;

-- 9. Insert some typical holidays
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

-- 10. Test access
SELECT 'TESTING ACCESS:' as info;
SELECT COUNT(*) as academic_years_count FROM academic_years;
SELECT COUNT(*) as typical_holidays_count FROM typical_holidays;

-- 11. Show all tables
SELECT 'ALL TABLES:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

SELECT 'Calendar tables created successfully!' as status; 