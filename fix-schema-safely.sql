-- Safe schema setup that handles existing tables and columns
-- This script checks what exists before creating anything

-- 1. Create families table if it doesn't exist
CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add family_id column to profiles table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'family_id') THEN
        ALTER TABLE profiles ADD COLUMN family_id UUID REFERENCES families(id);
    END IF;
END $$;

-- 3. Add family_id column to children table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'children' AND column_name = 'family_id') THEN
        ALTER TABLE children ADD COLUMN family_id UUID REFERENCES families(id);
    END IF;
END $$;

-- 4. Create family_years table if it doesn't exist
CREATE TABLE IF NOT EXISTS family_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    global_year_id UUID,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER,
    total_hours INTEGER,
    hours_per_day INTEGER,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create family_teaching_days table if it doesn't exist
CREATE TABLE IF NOT EXISTS family_teaching_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    family_year_id UUID NOT NULL REFERENCES family_years(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    label TEXT NOT NULL,
    is_teaching BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create calendar_days table if it doesn't exist
CREATE TABLE IF NOT EXISTS calendar_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    family_year_id UUID NOT NULL REFERENCES family_years(id) ON DELETE CASCADE,
    calendar_date DATE NOT NULL,
    is_vacation BOOLEAN DEFAULT false,
    is_teaching BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create subject table if it doesn't exist
CREATE TABLE IF NOT EXISTS subject (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    children_id UUID REFERENCES children(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grade TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create subject_track table if it doesn't exist
CREATE TABLE IF NOT EXISTS subject_track (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    class_schedule TEXT,
    study_days TEXT,
    travel_minutes INTEGER,
    platform TEXT,
    link TEXT,
    initial_plan TEXT,
    busy_time TEXT,
    roadmap JSONB,
    course_outline_raw TEXT,
    course_outline TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Handle global_official_holidays table safely
DO $$
BEGIN
    -- Check if the table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_official_holidays') THEN
        -- Create the table if it doesn't exist
        CREATE TABLE global_official_holidays (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            holiday_date DATE NOT NULL,
            holiday_name TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Insert holidays only if table was just created
        INSERT INTO global_official_holidays (holiday_date, holiday_name) VALUES
        ('2024-01-01', 'New Year''s Day'),
        ('2024-01-15', 'Martin Luther King Jr. Day'),
        ('2024-02-19', 'Presidents'' Day'),
        ('2024-05-27', 'Memorial Day'),
        ('2024-07-04', 'Independence Day'),
        ('2024-09-02', 'Labor Day'),
        ('2024-10-14', 'Columbus Day'),
        ('2024-11-11', 'Veterans Day'),
        ('2024-11-28', 'Thanksgiving Day'),
        ('2024-12-25', 'Christmas Day');
    ELSE
        -- Table exists, check if it has the right columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'global_official_holidays' AND column_name = 'holiday_name') THEN
            -- Add holiday_name column if it doesn't exist
            ALTER TABLE global_official_holidays ADD COLUMN holiday_name TEXT;
        END IF;
        
        -- Insert holidays only if they don't already exist
        INSERT INTO global_official_holidays (holiday_date, holiday_name) VALUES
        ('2024-01-01', 'New Year''s Day'),
        ('2024-01-15', 'Martin Luther King Jr. Day'),
        ('2024-02-19', 'Presidents'' Day'),
        ('2024-05-27', 'Memorial Day'),
        ('2024-07-04', 'Independence Day'),
        ('2024-09-02', 'Labor Day'),
        ('2024-10-14', 'Columbus Day'),
        ('2024-11-11', 'Veterans Day'),
        ('2024-11-28', 'Thanksgiving Day'),
        ('2024-12-25', 'Christmas Day')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 10. Set up RLS policies safely (drop existing ones first)
-- Families table
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own family" ON families;
DROP POLICY IF EXISTS "Users can update own family" ON families;
DROP POLICY IF EXISTS "Users can insert own family" ON families;

CREATE POLICY "Users can view own family" ON families
    FOR SELECT USING (
        id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can update own family" ON families
    FOR UPDATE USING (
        id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can insert own family" ON families
    FOR INSERT WITH CHECK (true);

-- Children table
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view family children" ON children;
DROP POLICY IF EXISTS "Users can update family children" ON children;
DROP POLICY IF EXISTS "Users can insert family children" ON children;
DROP POLICY IF EXISTS "Users can delete family children" ON children;

CREATE POLICY "Users can view family children" ON children
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can update family children" ON children
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can insert family children" ON children
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can delete family children" ON children
    FOR DELETE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Family years table
ALTER TABLE family_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view family years" ON family_years;
DROP POLICY IF EXISTS "Users can update family years" ON family_years;
DROP POLICY IF EXISTS "Users can insert family years" ON family_years;

CREATE POLICY "Users can view family years" ON family_years
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can update family years" ON family_years
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can insert family years" ON family_years
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Family teaching days table
ALTER TABLE family_teaching_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view family teaching days" ON family_teaching_days;
DROP POLICY IF EXISTS "Users can update family teaching days" ON family_teaching_days;
DROP POLICY IF EXISTS "Users can insert family teaching days" ON family_teaching_days;

CREATE POLICY "Users can view family teaching days" ON family_teaching_days
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can update family teaching days" ON family_teaching_days
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can insert family teaching days" ON family_teaching_days
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Calendar days table
ALTER TABLE calendar_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view family calendar days" ON calendar_days;
DROP POLICY IF EXISTS "Users can update family calendar days" ON calendar_days;
DROP POLICY IF EXISTS "Users can insert family calendar days" ON calendar_days;

CREATE POLICY "Users can view family calendar days" ON calendar_days
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can update family calendar days" ON calendar_days
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can insert family calendar days" ON calendar_days
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Subject table
ALTER TABLE subject ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view family subjects" ON subject;
DROP POLICY IF EXISTS "Users can update family subjects" ON subject;
DROP POLICY IF EXISTS "Users can insert family subjects" ON subject;

CREATE POLICY "Users can view family subjects" ON subject
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can update family subjects" ON subject
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can insert family subjects" ON subject
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Subject track table
ALTER TABLE subject_track ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view family subject tracks" ON subject_track;
DROP POLICY IF EXISTS "Users can update family subject tracks" ON subject_track;
DROP POLICY IF EXISTS "Users can insert family subject tracks" ON subject_track;

CREATE POLICY "Users can view family subject tracks" ON subject_track
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can update family subject tracks" ON subject_track
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );
CREATE POLICY "Users can insert family subject tracks" ON subject_track
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Global holidays table (read-only for all authenticated users)
ALTER TABLE global_official_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view global holidays" ON global_official_holidays;
CREATE POLICY "Users can view global holidays" ON global_official_holidays
    FOR SELECT USING (auth.role() = 'authenticated');

-- 11. Create a family for existing users
INSERT INTO families (id, name, created_at, updated_at)
SELECT 
    gen_random_uuid(), 
    'Family of ' || email,
    NOW(),
    NOW()
FROM auth.users 
WHERE id NOT IN (
    SELECT DISTINCT p.id 
    FROM profiles p 
    WHERE p.family_id IS NOT NULL
);

-- 12. Update profiles to link to families
UPDATE profiles 
SET family_id = (
    SELECT f.id 
    FROM families f 
    WHERE f.id NOT IN (
        SELECT DISTINCT family_id 
        FROM profiles 
        WHERE family_id IS NOT NULL
    )
    LIMIT 1
)
WHERE family_id IS NULL;

-- 13. Fix profiles RLS policy
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 14. Verify the setup
SELECT 'Families created:' as info, COUNT(*) as count FROM families
UNION ALL
SELECT 'Profiles with family_id:', COUNT(*) FROM profiles WHERE family_id IS NOT NULL
UNION ALL
SELECT 'Global holidays:', COUNT(*) FROM global_official_holidays; 