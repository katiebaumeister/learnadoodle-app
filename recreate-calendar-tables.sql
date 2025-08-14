-- Completely recreate calendar tables with correct structure and permissions
-- This will fix all the permission and column name issues

-- 1. Drop existing tables (this will cascade delete related data)
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS class_days CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;

-- 2. Create activities table with correct structure
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject_id UUID REFERENCES subject(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL DEFAULT 'custom',
  schedule_data JSONB DEFAULT '{}',
  ai_analysis JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create class_days table with correct structure
CREATE TABLE class_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_year_id UUID NOT NULL REFERENCES family_years(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  hours_per_day NUMERIC(4,2) DEFAULT 6.0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(family_year_id, day_of_week)
);

-- 4. Create holidays table with correct structure
CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_year_id UUID NOT NULL REFERENCES family_years(id) ON DELETE CASCADE,
  holiday_name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  description TEXT,
  is_proposed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(family_year_id, holiday_date)
);

-- 5. Create indexes for performance
CREATE INDEX idx_activities_family_id ON activities(family_id);
CREATE INDEX idx_activities_subject_id ON activities(subject_id);
CREATE INDEX idx_activities_created_at ON activities(created_at);

CREATE INDEX idx_class_days_family_year_id ON class_days(family_year_id);
CREATE INDEX idx_class_days_day_of_week ON class_days(day_of_week);

CREATE INDEX idx_holidays_family_year_id ON holidays(family_year_id);
CREATE INDEX idx_holidays_date ON holidays(holiday_date);

-- 6. Enable Row Level Security on all tables
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for activities table
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

-- 8. Create RLS policies for class_days table
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

-- 9. Create RLS policies for holidays table
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

-- 10. Add some sample data for testing (optional)
-- Uncomment these lines if you want to add test data
/*
-- Sample activities
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

-- Sample class days (Monday = 1, Tuesday = 2, etc.)
INSERT INTO class_days (family_year_id, day_of_week, hours_per_day, notes)
SELECT 
  fy.id as family_year_id,
  generate_series(1, 5) as day_of_week, -- Monday to Friday
  6.0 as hours_per_day,
  'Regular school day' as notes
FROM family_years fy
JOIN family f ON fy.family_id = f.id
JOIN profiles p ON f.id = p.family_id
WHERE p.id = auth.uid()
LIMIT 1;

-- Sample holidays
INSERT INTO holidays (family_year_id, holiday_name, holiday_date, description)
SELECT 
  fy.id as family_year_id,
  'Winter Break' as holiday_name,
  '2024-12-23'::date as holiday_date,
  'Winter holiday break' as description
FROM family_years fy
JOIN family f ON fy.family_id = f.id
JOIN profiles p ON f.id = p.family_id
WHERE p.id = auth.uid()
LIMIT 1;
*/

-- 11. Verify the setup
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

-- 12. Show table structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name IN ('activities', 'class_days', 'holidays')
ORDER BY table_name, ordinal_position;

-- 13. Show RLS policies
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
