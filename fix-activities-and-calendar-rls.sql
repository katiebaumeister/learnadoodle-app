-- Fix RLS policies for activities table and ensure class_days table exists
-- This addresses the 403 permission errors and 404 for class_days

-- 1. First, let's check if the activities table exists and has the right structure
DO $$
BEGIN
  -- Create activities table if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activities') THEN
    CREATE TABLE activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id UUID REFERENCES family(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      subject_id UUID REFERENCES subject(id) ON DELETE CASCADE,
      activity_type VARCHAR(50) NOT NULL, -- 'live', 'self-paced', 'custom'
      schedule_data JSONB, -- Store schedule information
      ai_analysis JSONB DEFAULT '{}', -- Store AI analysis results
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_activities_family_id ON activities(family_id);
    CREATE INDEX IF NOT EXISTS idx_activities_subject_id ON activities(subject_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
    
    RAISE NOTICE 'Created activities table';
  ELSE
    RAISE NOTICE 'Activities table already exists';
  END IF;
END $$;

-- 2. Enable RLS on activities table
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can insert their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can update their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their family's activities" ON activities;

-- 4. Create RLS policies for activities table
CREATE POLICY "Users can view their family's activities" ON activities
  FOR SELECT USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their family's activities" ON activities
  FOR INSERT WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their family's activities" ON activities
  FOR UPDATE USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their family's activities" ON activities
  FOR DELETE USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 5. Ensure class_days table exists with proper structure
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_days') THEN
    CREATE TABLE class_days (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_year_id UUID REFERENCES family_years(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
      hours_per_day NUMERIC(4,2) DEFAULT 6.0, -- Default 6 hours per day
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_class_days_family_year_id ON class_days(family_year_id);
    CREATE INDEX IF NOT EXISTS idx_class_days_day_of_week ON class_days(day_of_week);
    
    RAISE NOTICE 'Created class_days table';
  ELSE
    RAISE NOTICE 'Class_days table already exists';
  END IF;
END $$;

-- 6. Enable RLS on class_days table
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for class_days table
DROP POLICY IF EXISTS "Users can view their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can insert their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can update their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can delete their family's class days" ON class_days;

CREATE POLICY "Users can view their family's class days" ON class_days
  FOR SELECT USING (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their family's class days" ON class_days
  FOR INSERT WITH CHECK (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can update their family's class days" ON class_days
  FOR UPDATE USING (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their family's class days" ON class_days
  FOR DELETE USING (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

-- 8. Ensure holidays table exists and has proper RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'holidays') THEN
    CREATE TABLE holidays (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_year_id UUID REFERENCES family_years(id) ON DELETE CASCADE,
      holiday_name TEXT NOT NULL,
      holiday_date DATE NOT NULL,
      description TEXT,
      is_proposed BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_holidays_family_year_id ON holidays(family_year_id);
    CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);
    
    RAISE NOTICE 'Created holidays table';
  ELSE
    RAISE NOTICE 'Holidays table already exists';
  END IF;
END $$;

-- 9. Enable RLS on holidays table
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS policies for holidays table
DROP POLICY IF EXISTS "Users can view their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can insert their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can update their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can delete their family's holidays" ON holidays;

CREATE POLICY "Users can view their family's holidays" ON holidays
  FOR SELECT USING (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their family's holidays" ON holidays
  FOR INSERT WITH CHECK (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can update their family's holidays" ON holidays
  FOR UPDATE USING (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their family's holidays" ON holidays
  FOR DELETE USING (
    family_year_id IN (
      SELECT fy.id FROM family_years fy
      JOIN family f ON fy.family_id = f.id
      JOIN profiles p ON f.id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

-- 11. Add some sample data for testing (optional)
-- Uncomment these lines if you want to add test data
/*
INSERT INTO activities (family_id, name, subject_id, activity_type, schedule_data, ai_analysis)
SELECT 
  f.id as family_id,
  'Math Worksheet 1' as name,
  s.id as subject_id,
  'self-paced' as activity_type,
  '{"status": "todo", "due_date": "2024-01-15"}'::jsonb as schedule_data,
  '{"difficulty": "medium", "estimated_time": "30min"}'::jsonb as ai_analysis
FROM family f
JOIN profiles p ON f.id = p.family_id
JOIN subject s ON f.id = s.family_id
WHERE p.id = auth.uid()
LIMIT 1;
*/

-- 12. Verify the setup
SELECT 
  'activities' as table_name,
  COUNT(*) as row_count,
  'RLS enabled' as status
FROM activities
UNION ALL
SELECT 
  'class_days' as table_name,
  COUNT(*) as row_count,
  'RLS enabled' as status
FROM class_days
UNION ALL
SELECT 
  'holidays' as table_name,
  COUNT(*) as row_count,
  'RLS enabled' as status
FROM holidays;

-- 13. Show RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;
