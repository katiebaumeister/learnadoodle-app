-- Fix column names and RLS policies for calendar tables
-- This addresses the column name mismatches and permission errors

-- 1. First, let's check and fix the holidays table column name
DO $$
BEGIN
  -- Check if holidays table has academic_year_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'holidays' AND column_name = 'academic_year_id'
  ) THEN
    -- Rename the column from academic_year_id to family_year_id
    ALTER TABLE holidays RENAME COLUMN academic_year_id TO family_year_id;
    RAISE NOTICE 'Renamed holidays.academic_year_id to holidays.family_year_id';
  END IF;
  
  -- Check if holidays table has family_year_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'holidays' AND column_name = 'family_year_id'
  ) THEN
    -- Add family_year_id column if it doesn't exist
    ALTER TABLE holidays ADD COLUMN family_year_id UUID;
    RAISE NOTICE 'Added holidays.family_year_id column';
  END IF;
END $$;

-- 2. Check and fix the class_days table column name
DO $$
BEGIN
  -- Check if class_days table has academic_year_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'class_days' AND column_name = 'academic_year_id'
  ) THEN
    -- Rename the column from academic_year_id to family_year_id
    ALTER TABLE class_days RENAME COLUMN academic_year_id TO family_year_id;
    RAISE NOTICE 'Renamed class_days.academic_year_id to class_days.family_year_id';
  END IF;
  
  -- Check if class_days table has family_year_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'class_days' AND column_name = 'family_year_id'
  ) THEN
    -- Add family_year_id column if it doesn't exist
    ALTER TABLE class_days ADD COLUMN family_year_id UUID;
    RAISE NOTICE 'Added class_days.family_year_id column';
  END IF;
END $$;

-- 3. Ensure activities table exists with proper structure
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activities') THEN
    CREATE TABLE activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id UUID REFERENCES family(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      subject_id UUID REFERENCES subject(id) ON DELETE CASCADE,
      activity_type VARCHAR(50) NOT NULL,
      schedule_data JSONB,
      ai_analysis JSONB DEFAULT '{}',
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

-- 4. Enable RLS on all tables
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can insert their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can update their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their family's activities" ON activities;

DROP POLICY IF EXISTS "Users can view their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can insert their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can update their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can delete their family's class days" ON class_days;

DROP POLICY IF EXISTS "Users can view their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can insert their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can update their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can delete their family's holidays" ON holidays;

-- 6. Create RLS policies for activities table
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

-- 7. Create RLS policies for class_days table
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

-- 8. Create RLS policies for holidays table
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

-- 9. Create proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_activities_family_id ON activities(family_id);
CREATE INDEX IF NOT EXISTS idx_activities_subject_id ON activities(subject_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

CREATE INDEX IF NOT EXISTS idx_class_days_family_year_id ON class_days(family_year_id);
CREATE INDEX IF NOT EXISTS idx_class_days_day_of_week ON class_days(day_of_week);

CREATE INDEX IF NOT EXISTS idx_holidays_family_year_id ON holidays(family_year_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);

-- 10. Verify the column structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name IN ('activities', 'class_days', 'holidays')
  AND column_name IN ('family_id', 'family_year_id')
ORDER BY table_name, column_name;

-- 11. Verify RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 12. Show table row counts
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
