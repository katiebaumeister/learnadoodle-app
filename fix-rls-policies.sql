-- Fix RLS Policies for Calendar Tables
-- This script ensures proper RLS policies are in place for calendar functionality

-- First, let's check what policies exist
SELECT 'EXISTING POLICIES:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY tablename, policyname;

-- Drop all existing policies on calendar tables
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON ' || policy_record.schemaname || '.' || policy_record.tablename;
    END LOOP;
END $$;

-- Enable RLS on all tables
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

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

-- Show the final policies
SELECT 'FINAL POLICIES:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY tablename, policyname;

SELECT 'RLS policies fixed successfully!' as status; 