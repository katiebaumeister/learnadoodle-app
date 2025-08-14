-- Setup Calendar Tables for Learnadoodle
-- This script creates all the necessary tables for the calendar planning system

-- 1. Create academic_years table
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

-- 2. Create typical_holidays table for holiday templates
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

-- 3. Create holidays table for academic year-specific holidays
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    holiday_name TEXT NOT NULL,
    holiday_date DATE NOT NULL,
    is_proposed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create class_days table for defining days of the week with classes
CREATE TABLE IF NOT EXISTS class_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 (Sunday) to 6 (Saturday)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, day_of_week)
);

-- 5. Create class_day_mappings table to map dates to sequential class days
CREATE TABLE IF NOT EXISTS class_day_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_date DATE NOT NULL,
    class_day_number INTEGER,
    is_vacation BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(academic_year_id, class_date)
);

-- 6. Create lessons table for managing lessons
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

-- Add missing columns to lessons table if they don't exist
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS lesson_date DATE;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content_summary TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content_details TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 7. Create attendance table for tracking attendance
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    attended BOOLEAN NOT NULL,
    notes TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(child_id, attendance_date)
);

-- Add indexes for performance
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

-- Add RLS (Row Level Security) policies
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Note: typical_holidays doesn't need RLS as it's global data

-- Create RLS policies for academic_years
CREATE POLICY "Users can view their family's academic years" ON academic_years
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their family's academic years" ON academic_years
    FOR INSERT WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their family's academic years" ON academic_years
    FOR UPDATE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their family's academic years" ON academic_years
    FOR DELETE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Create RLS policies for holidays
CREATE POLICY "Users can view their family's holidays" ON holidays
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert their family's holidays" ON holidays
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their family's holidays" ON holidays
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete their family's holidays" ON holidays
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Create RLS policies for class_days
CREATE POLICY "Users can view their family's class days" ON class_days
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert their family's class days" ON class_days
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their family's class days" ON class_days
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete their family's class days" ON class_days
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Create RLS policies for class_day_mappings
CREATE POLICY "Users can view their family's class day mappings" ON class_day_mappings
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert their family's class day mappings" ON class_day_mappings
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their family's class day mappings" ON class_day_mappings
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete their family's class day mappings" ON class_day_mappings
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Create RLS policies for lessons
CREATE POLICY "Users can view their family's lessons" ON lessons
    FOR SELECT USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert their family's lessons" ON lessons
    FOR INSERT WITH CHECK (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their family's lessons" ON lessons
    FOR UPDATE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete their family's lessons" ON lessons
    FOR DELETE USING (
        academic_year_id IN (
            SELECT id FROM academic_years WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Create RLS policies for attendance
CREATE POLICY "Users can view their family's attendance" ON attendance
    FOR SELECT USING (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert their family's attendance" ON attendance
    FOR INSERT WITH CHECK (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their family's attendance" ON attendance
    FOR UPDATE USING (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete their family's attendance" ON attendance
    FOR DELETE USING (
        child_id IN (
            SELECT id FROM children WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Insert some typical holidays
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

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_academic_years_updated_at BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Calendar tables created successfully!' as status; 