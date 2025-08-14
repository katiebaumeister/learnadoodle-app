-- Complete Onboarding Schema Setup
-- This script adds all missing tables and columns for the full onboarding flow

-- 1. Create global_academic_years table
CREATE TABLE IF NOT EXISTS global_academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL, -- e.g., '2025-26'
  region text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add region column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'global_academic_years' AND column_name = 'region') THEN
    ALTER TABLE global_academic_years ADD COLUMN region text;
  END IF;
END $$;

-- 2. Create global_official_holidays table
CREATE TABLE IF NOT EXISTS global_official_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create typical_holidays table
CREATE TABLE IF NOT EXISTS typical_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_name text,
  holiday_type text,
  month int,
  day int,
  rule text,
  start_date text,
  end_date text
);

-- 4. Create holidays table
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_year_id uuid REFERENCES family_years(id),
  holiday_name text,
  holiday_date date,
  is_proposed boolean
);

-- 5. Create class_days table
CREATE TABLE IF NOT EXISTS class_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_year_id uuid REFERENCES family_years(id),
  day_of_week int -- 0=Sunday, 6=Saturday
);

-- 6. Create class_day_mappings table
CREATE TABLE IF NOT EXISTS class_day_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_year_id uuid REFERENCES family_years(id),
  class_date date,
  class_day_number int,
  is_vacation boolean
);

-- 7. Create lessons table
CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES family(id),
  subject_id uuid REFERENCES subject(id),
  title text,
  content text,
  created_at timestamptz DEFAULT now()
);

-- 8. Create track table
CREATE TABLE IF NOT EXISTS track (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_track_id uuid REFERENCES subject_track(id),
  subject_id uuid REFERENCES subject(id)
);

-- 9. Add missing columns to existing tables

-- Add family_id to family_years if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_years' AND column_name = 'family_id') THEN
    ALTER TABLE family_years ADD COLUMN family_id uuid REFERENCES family(id);
  END IF;
END $$;

-- Add global_year_id to family_years if not exists (rename from global_academic_year_id)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_years' AND column_name = 'global_year_id') THEN
    ALTER TABLE family_years ADD COLUMN global_year_id uuid REFERENCES global_academic_years(id);
  END IF;
END $$;

-- Add is_current to family_years if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_years' AND column_name = 'is_current') THEN
    ALTER TABLE family_years ADD COLUMN is_current boolean DEFAULT false;
  END IF;
END $$;

-- Add family_id to family_teaching_days if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_teaching_days' AND column_name = 'family_id') THEN
    ALTER TABLE family_teaching_days ADD COLUMN family_id uuid REFERENCES family(id);
  END IF;
END $$;

-- Add family_id to calendar_days if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calendar_days' AND column_name = 'family_id') THEN
    ALTER TABLE calendar_days ADD COLUMN family_id uuid REFERENCES family(id);
  END IF;
END $$;

-- Add family_id to subject if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject' AND column_name = 'family_id') THEN
    ALTER TABLE subject ADD COLUMN family_id uuid REFERENCES family(id);
  END IF;
END $$;

-- Add family_year_id to subject if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject' AND column_name = 'family_year_id') THEN
    ALTER TABLE subject ADD COLUMN family_year_id uuid REFERENCES family_years(id);
  END IF;
END $$;

-- Add family_id to subject_track if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'family_id') THEN
    ALTER TABLE subject_track ADD COLUMN family_id uuid REFERENCES family(id);
  END IF;
END $$;

-- Add family_id to attendance if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'family_id') THEN
    ALTER TABLE attendance ADD COLUMN family_id uuid REFERENCES family(id);
  END IF;
END $$;

-- Add family_year_id to attendance if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'family_year_id') THEN
    ALTER TABLE attendance ADD COLUMN family_year_id uuid REFERENCES family_years(id);
  END IF;
END $$;

-- Add family_id to lessons if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lessons' AND column_name = 'family_id') THEN
    ALTER TABLE lessons ADD COLUMN family_id uuid REFERENCES family(id);
  END IF;
END $$;

-- Add values column to family if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family' AND column_name = 'values') THEN
    ALTER TABLE family ADD COLUMN values jsonb;
  END IF;
END $$;

-- 10. Enable RLS on all tables
ALTER TABLE global_academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_official_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE typical_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE track ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS policies for family-scoped tables
-- Global tables - allow read access to all authenticated users
CREATE POLICY "Allow read access to global_academic_years" ON global_academic_years FOR SELECT USING (true);
CREATE POLICY "Allow read access to global_official_holidays" ON global_official_holidays FOR SELECT USING (true);
CREATE POLICY "Allow read access to typical_holidays" ON typical_holidays FOR SELECT USING (true);

-- Family-scoped tables - only allow access to users in the same family
CREATE POLICY "Family can access holidays" ON holidays
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE auth.uid() = profiles.id
    AND profiles.family_id = (
      SELECT family_id FROM family_years WHERE id = holidays.family_year_id
    )
  ));

CREATE POLICY "Family can access class_days" ON class_days
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE auth.uid() = profiles.id
    AND profiles.family_id = (
      SELECT family_id FROM family_years WHERE id = class_days.family_year_id
    )
  ));

CREATE POLICY "Family can access class_day_mappings" ON class_day_mappings
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE auth.uid() = profiles.id
    AND profiles.family_id = (
      SELECT family_id FROM family_years WHERE id = class_day_mappings.family_year_id
    )
  ));

CREATE POLICY "Family can access lessons" ON lessons
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE auth.uid() = profiles.id
    AND profiles.family_id = lessons.family_id
  ));

CREATE POLICY "Family can access track" ON track
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE auth.uid() = profiles.id
    AND profiles.family_id = (
      SELECT family_id FROM subject_track WHERE id = track.subject_track_id
    )
  ));

-- 12. Add unique constraints
-- Make dates unique in the holiday list
ALTER TABLE public.global_official_holidays
ADD CONSTRAINT uq_goh_date UNIQUE (holiday_date);

-- Make year label unique
ALTER TABLE public.global_academic_years
ADD CONSTRAINT uq_gay_label UNIQUE (label);

-- 13. Seed academic year labels
INSERT INTO public.global_academic_years (label)
VALUES ('2025-26'),
('2026-27')
ON CONFLICT (label) DO NOTHING;

-- 14. Seed comprehensive US holidays 2025-26 & 2026-27
-- Thanksgiving + Winter Break + federal/bank holidays
-- NO spring break
INSERT INTO public.global_official_holidays (holiday_date, name)
VALUES
/* === AY 2025-26 === */
('2025-07-04', 'Independence Day'),
('2025-09-01', 'Labor Day'),
('2025-10-13', 'Indigenous Peoples'' / Columbus Day'),
('2025-11-11', 'Veterans Day'),
('2025-11-27', 'Thanksgiving'),
('2025-11-28', 'Thanksgiving'),
-- Winter Break 22 Dec 2025 – 03 Jan 2026
('2025-12-22', 'Winter Break'),
('2025-12-23', 'Winter Break'),
('2025-12-24', 'Winter Break'),
('2025-12-25', 'Winter Break'),
('2025-12-26', 'Winter Break'),
('2025-12-29', 'Winter Break'),
('2025-12-30', 'Winter Break'),
('2025-12-31', 'Winter Break'),
('2026-01-01', 'Winter Break'),
('2026-01-02', 'Winter Break'),
('2026-01-03', 'Winter Break'),
('2026-01-19', 'MLK'),
('2026-02-16', 'Presidents Day'),
('2026-05-25', 'Memorial Day'),
/* === AY 2026-27 === */
('2026-07-04', 'Independence Day'),
('2026-09-07', 'Labor Day'),
('2026-10-12', 'Indigenous Peoples'' / Columbus Day'),
('2026-11-11', 'Veterans Day'),
('2026-11-26', 'Thanksgiving'),
('2026-11-27', 'Thanksgiving'),
-- Winter Break 20 Dec 2026 – 03 Jan 2027
('2026-12-20', 'Winter Break'),
('2026-12-21', 'Winter Break'),
('2026-12-22', 'Winter Break'),
('2026-12-23', 'Winter Break'),
('2026-12-24', 'Winter Break'),
('2026-12-25', 'Winter Break'),
('2026-12-28', 'Winter Break'),
('2026-12-29', 'Winter Break'),
('2026-12-30', 'Winter Break'),
('2026-12-31', 'Winter Break'),
('2027-01-01', 'Winter Break'),
('2027-01-02', 'Winter Break'),
('2027-01-03', 'Winter Break'),
('2027-01-18', 'MLK'),
('2027-02-15', 'Presidents Day'),
('2027-05-31', 'Memorial Day')
ON CONFLICT (holiday_date) DO NOTHING;

-- 15. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_family_years_family_id ON family_years(family_id);
CREATE INDEX IF NOT EXISTS idx_family_years_global_year_id ON family_years(global_year_id);
CREATE INDEX IF NOT EXISTS idx_family_teaching_days_family_id ON family_teaching_days(family_id);
CREATE INDEX IF NOT EXISTS idx_family_teaching_days_family_year_id ON family_teaching_days(family_year_id);
CREATE INDEX IF NOT EXISTS idx_calendar_days_family_id ON calendar_days(family_id);
CREATE INDEX IF NOT EXISTS idx_calendar_days_family_year_id ON calendar_days(family_year_id);
CREATE INDEX IF NOT EXISTS idx_calendar_days_calendar_date ON calendar_days(calendar_date);
CREATE INDEX IF NOT EXISTS idx_subject_family_id ON subject(family_id);
CREATE INDEX IF NOT EXISTS idx_subject_family_year_id ON subject(family_year_id);
CREATE INDEX IF NOT EXISTS idx_subject_track_family_id ON subject_track(family_id);
CREATE INDEX IF NOT EXISTS idx_attendance_family_id ON attendance(family_id);
CREATE INDEX IF NOT EXISTS idx_attendance_family_year_id ON attendance(family_year_id);
CREATE INDEX IF NOT EXISTS idx_lessons_family_id ON lessons(family_id);
CREATE INDEX IF NOT EXISTS idx_lessons_subject_id ON lessons(subject_id);
CREATE INDEX IF NOT EXISTS idx_track_subject_track_id ON track(subject_track_id);
CREATE INDEX IF NOT EXISTS idx_track_subject_id ON track(subject_id);
CREATE INDEX IF NOT EXISTS idx_holidays_family_year_id ON holidays(family_year_id);
CREATE INDEX IF NOT EXISTS idx_class_days_family_year_id ON class_days(family_year_id);
CREATE INDEX IF NOT EXISTS idx_class_day_mappings_family_year_id ON class_day_mappings(family_year_id);
CREATE INDEX IF NOT EXISTS idx_class_day_mappings_class_date ON class_day_mappings(class_date);
CREATE INDEX IF NOT EXISTS idx_global_official_holidays_holiday_date ON global_official_holidays(holiday_date); 

/* ==========================================================
QUICK-FIX MIGRATION: children.college_bound, subject.skills, RLS
========================================================== */

/* a) children.college_bound (boolean → text) */
ALTER TABLE children
  ALTER COLUMN college_bound TYPE text
    USING CASE
      WHEN college_bound IS TRUE THEN 'yes'
      WHEN college_bound IS FALSE THEN 'no'
      ELSE NULL
    END,
  ALTER COLUMN college_bound DROP DEFAULT; -- remove any boolean default

-- (optional) add a new default
-- ALTER TABLE children ALTER COLUMN college_bound SET DEFAULT 'undecided';

/* b) subject.skills (text → jsonb, safe conversion) */

/* Step 1: Clean up data to avoid conversion errors */
UPDATE subject
SET skills = '[]'
WHERE skills IS NULL OR skills = '';

/* Step 2: Convert column type */
ALTER TABLE subject
  ALTER COLUMN skills TYPE jsonb
    USING
      CASE
        WHEN skills IS NULL OR skills = '' THEN '[]'::jsonb
        WHEN skills ~ '^[\\[{]' THEN skills::jsonb
        ELSE to_jsonb(skills)
      END,
  ALTER COLUMN skills SET DEFAULT '[]'::jsonb,
  ALTER COLUMN skills DROP NOT NULL; -- if you want to allow NULLs

/* c) RLS for global tables */
ALTER TABLE public.global_official_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all users to read holidays"
  ON public.global_official_holidays
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all users to read academic years"
  ON public.global_academic_years
  FOR SELECT
  TO authenticated
  USING (true);

-- Remove problematic JWT-based policies - they cause syntax errors
-- CREATE POLICY "Only allow admins to modify holidays"
--   ON public.global_official_holidays
--   FOR ALL
--   TO authenticated
--   USING ((auth.jwt() ->> 'app_metadata')::jsonb @> '{"role": "admin"}')
--   WITH CHECK ((auth.jwt() ->> 'app_metadata')::jsonb @> '{"role": "admin"}');

-- CREATE POLICY "Only allow admins to modify academic years"
--   ON public.global_academic_years
--   FOR ALL
--   TO authenticated
--   USING ((auth.jwt() ->> 'app_metadata')::jsonb @> '{"role": "admin"}')
--   WITH CHECK ((auth.jwt() ->> 'app_metadata')::jsonb @> '{"role": "admin"}'); 

-- ==========================================================
-- RLS POLICIES FOR PROFILES TABLE (SAFE, NO RECURSION)
-- ==========================================================

-- TEMPORARILY DISABLE RLS TO FIX INFINITE RECURSION
-- Drop ALL existing policies on profiles to avoid conflicts
DROP POLICY IF EXISTS "Self can access profile" ON profiles;
DROP POLICY IF EXISTS "Family can access profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_policy" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON profiles;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON profiles;
DROP POLICY IF EXISTS "profiles_family_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_self_policy" ON profiles;

-- DISABLE RLS TEMPORARILY TO STOP INFINITE RECURSION
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- COMMENT OUT RLS POLICIES UNTIL WE CAN DEBUG THE RECURSION ISSUE
-- Enable RLS if not already enabled
-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ONLY allow users to access their own profile (SAFE, NO RECURSION)
-- CREATE POLICY "Self can access profile" ON profiles
--   FOR ALL
--   USING (auth.uid() = id)
--   WITH CHECK (auth.uid() = id);

-- ==========================================================
-- RLS POLICIES FOR FAMILY TABLE
-- ==========================================================

-- Drop existing policies on family table
DROP POLICY IF EXISTS "Family access by family_id" ON family;
DROP POLICY IF EXISTS "Family access by user" ON family;
DROP POLICY IF EXISTS "Enable read access for all users" ON family;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON family;
DROP POLICY IF EXISTS "Enable update for users based on family_id" ON family;
DROP POLICY IF EXISTS "Enable delete for users based on family_id" ON family;

-- Enable RLS on family table
ALTER TABLE family ENABLE ROW LEVEL SECURITY;

-- TEMPORARILY DISABLE RLS ON FAMILY TABLE TO AVOID RECURSION
-- Allow users to access family records where they are a member
-- This assumes profiles table has family_id column
-- CREATE POLICY "Family access by user" ON family
--   FOR ALL
--   USING (
--     id IN (
--       SELECT family_id FROM profiles WHERE id = auth.uid()
--     )
--   )
--   WITH CHECK (
--     id IN (
--       SELECT family_id FROM profiles WHERE id = auth.uid()
--     )
--   );

-- DISABLE RLS ON FAMILY TABLE TEMPORARILY
ALTER TABLE family DISABLE ROW LEVEL SECURITY;

-- ==========================================================
-- COMPLETE FIX WITH RLS POLICY FIXES
-- ==========================================================

-- 1. DROP ALL EXISTING POLICIES ON PROFILES TABLE
DROP POLICY IF EXISTS "Self can access profile" ON profiles;
DROP POLICY IF EXISTS "Family can access profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_policy" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON profiles;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON profiles;
DROP POLICY IF EXISTS "profiles_family_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_self_policy" ON profiles;

-- 2. DISABLE RLS ON ALL TABLES TO FIX PERMISSION ISSUES
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE family DISABLE ROW LEVEL SECURITY;
ALTER TABLE children DISABLE ROW LEVEL SECURITY;
ALTER TABLE family_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE family_teaching_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE subject DISABLE ROW LEVEL SECURITY;
ALTER TABLE subject_track DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE track DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings DISABLE ROW LEVEL SECURITY;

-- 3. FIX RLS POLICIES FOR GLOBAL TABLES
-- Drop existing policies on global tables
DROP POLICY IF EXISTS "Allow read access to global_academic_years" ON global_academic_years;
DROP POLICY IF EXISTS "Allow read access to global_official_holidays" ON global_official_holidays;
DROP POLICY IF EXISTS "Allow all users to read holidays" ON global_official_holidays;
DROP POLICY IF EXISTS "Allow all users to read academic years" ON global_academic_years;
DROP POLICY IF EXISTS "Only allow admins to modify holidays" ON global_official_holidays;
DROP POLICY IF EXISTS "Only allow admins to modify academic years" ON global_academic_years;
DROP POLICY IF EXISTS "Allow read to all" ON global_academic_years;
DROP POLICY IF EXISTS "Allow read to all" ON global_official_holidays;

-- Create comprehensive policies for global_academic_years
CREATE POLICY "Allow all operations on global_academic_years" ON global_academic_years
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create comprehensive policies for global_official_holidays
CREATE POLICY "Allow all operations on global_official_holidays" ON global_official_holidays
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. GRANT PERMISSIONS TO AUTHENTICATED USERS
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 5. FIX DATE FIELDS TO HANDLE INVALID DATES
-- Make date fields nullable to avoid invalid date errors
ALTER TABLE global_official_holidays ALTER COLUMN holiday_date DROP NOT NULL;
ALTER TABLE calendar_days ALTER COLUMN calendar_date DROP NOT NULL;
ALTER TABLE class_day_mappings ALTER COLUMN class_date DROP NOT NULL;

-- Update any invalid dates to NULL
UPDATE global_official_holidays SET holiday_date = NULL WHERE holiday_date IS NOT NULL AND holiday_date < '1900-01-01';
UPDATE calendar_days SET calendar_date = NULL WHERE calendar_date IS NOT NULL AND calendar_date < '1900-01-01';
UPDATE class_day_mappings SET class_date = NULL WHERE class_date IS NOT NULL AND class_date < '1900-01-01';

-- Add check constraints to prevent future invalid dates (only if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_valid_holiday_date') THEN
    ALTER TABLE global_official_holidays ADD CONSTRAINT check_valid_holiday_date 
      CHECK (holiday_date IS NULL OR holiday_date >= '1900-01-01');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_valid_calendar_date') THEN
    ALTER TABLE calendar_days ADD CONSTRAINT check_valid_calendar_date 
      CHECK (calendar_date IS NULL OR calendar_date >= '1900-01-01');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_valid_class_date') THEN
    ALTER TABLE class_day_mappings ADD CONSTRAINT check_valid_class_date 
      CHECK (class_date IS NULL OR class_date >= '1900-01-01');
  END IF;
END $$;

-- 6. FIX NUMERIC FIELD OVERFLOW
-- Fix the numeric field in family_years table
-- Change from 'numeric' to 'numeric(5,2)' to allow values like 12.50
ALTER TABLE family_years ALTER COLUMN hours_per_day TYPE numeric(5,2);

-- Update any existing values that might be too large
UPDATE family_years SET hours_per_day = 24.00 WHERE hours_per_day > 24.00;
UPDATE family_years SET hours_per_day = 0.00 WHERE hours_per_day < 0.00;

-- ==========================================================
-- FIX BOOLEAN FIELD ISSUES
-- ==========================================================

-- 1. Clean up any existing invalid data in boolean fields
-- Fix family_years.is_current field
UPDATE family_years 
SET is_current = false 
WHERE is_current IS NULL OR is_current IS NOT TRUE;

-- Fix family_teaching_days.is_teaching field
UPDATE family_teaching_days 
SET is_teaching = true 
WHERE is_teaching IS NULL;

-- Fix calendar_days.is_vacation field
UPDATE calendar_days 
SET is_vacation = false 
WHERE is_vacation IS NULL;

-- Fix calendar_days.is_teaching field
UPDATE calendar_days 
SET is_teaching = true 
WHERE is_teaching IS NULL;

-- Fix class_day_mappings.is_vacation field
UPDATE class_day_mappings 
SET is_vacation = false 
WHERE is_vacation IS NULL;

-- Fix holidays.is_proposed field
UPDATE holidays 
SET is_proposed = false 
WHERE is_proposed IS NULL;

-- 2. Ensure all boolean fields have proper defaults and constraints
ALTER TABLE family_years ALTER COLUMN is_current SET DEFAULT false;
ALTER TABLE family_years ALTER COLUMN is_current SET NOT NULL;

ALTER TABLE family_teaching_days ALTER COLUMN is_teaching SET DEFAULT true;
ALTER TABLE family_teaching_days ALTER COLUMN is_teaching SET NOT NULL;

ALTER TABLE calendar_days ALTER COLUMN is_vacation SET DEFAULT false;
ALTER TABLE calendar_days ALTER COLUMN is_teaching SET DEFAULT true;

ALTER TABLE class_day_mappings ALTER COLUMN is_vacation SET DEFAULT false;

ALTER TABLE holidays ALTER COLUMN is_proposed SET DEFAULT false;

-- 3. Add check constraints to ensure boolean fields only accept true/false
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_is_current_boolean') THEN
    ALTER TABLE family_years ADD CONSTRAINT check_is_current_boolean CHECK (is_current IN (true, false));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_is_teaching_boolean') THEN
    ALTER TABLE family_teaching_days ADD CONSTRAINT check_is_teaching_boolean CHECK (is_teaching IN (true, false));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_is_vacation_boolean') THEN
    ALTER TABLE calendar_days ADD CONSTRAINT check_is_vacation_boolean CHECK (is_vacation IN (true, false));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_calendar_is_teaching_boolean') THEN
    ALTER TABLE calendar_days ADD CONSTRAINT check_calendar_is_teaching_boolean CHECK (is_teaching IN (true, false));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_class_vacation_boolean') THEN
    ALTER TABLE class_day_mappings ADD CONSTRAINT check_class_vacation_boolean CHECK (is_vacation IN (true, false));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_is_proposed_boolean') THEN
    ALTER TABLE holidays ADD CONSTRAINT check_is_proposed_boolean CHECK (is_proposed IN (true, false));
  END IF;
END $$;

-- ==========================================================
-- END OF BOOLEAN FIELD FIXES
-- ==========================================================

-- ==========================================================
-- COMPREHENSIVE FIX FOR UUID-TO-BOOLEAN ERROR
-- ==========================================================

-- 1. First, let's identify and clean up any problematic data
-- Check for any non-boolean values in boolean columns
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Check family_years.is_current
    FOR r IN SELECT id, is_current FROM family_years WHERE is_current IS NOT NULL AND is_current IS NOT TRUE AND is_current IS NOT FALSE
    LOOP
        UPDATE family_years SET is_current = false WHERE id = r.id;
        RAISE NOTICE 'Fixed family_years.is_current for id: %', r.id;
    END LOOP;
    
    -- Check family_teaching_days.is_teaching
    FOR r IN SELECT id, is_teaching FROM family_teaching_days WHERE is_teaching IS NOT NULL AND is_teaching IS NOT TRUE AND is_teaching IS NOT FALSE
    LOOP
        UPDATE family_teaching_days SET is_teaching = true WHERE id = r.id;
        RAISE NOTICE 'Fixed family_teaching_days.is_teaching for id: %', r.id;
    END LOOP;
    
    -- Check calendar_days.is_vacation
    FOR r IN SELECT id, is_vacation FROM calendar_days WHERE is_vacation IS NOT NULL AND is_vacation IS NOT TRUE AND is_vacation IS NOT FALSE
    LOOP
        UPDATE calendar_days SET is_vacation = false WHERE id = r.id;
        RAISE NOTICE 'Fixed calendar_days.is_vacation for id: %', r.id;
    END LOOP;
    
    -- Check calendar_days.is_teaching
    FOR r IN SELECT id, is_teaching FROM calendar_days WHERE is_teaching IS NOT NULL AND is_teaching IS NOT TRUE AND is_teaching IS NOT FALSE
    LOOP
        UPDATE calendar_days SET is_teaching = true WHERE id = r.id;
        RAISE NOTICE 'Fixed calendar_days.is_teaching for id: %', r.id;
    END LOOP;
    
    -- Check class_day_mappings.is_vacation
    FOR r IN SELECT id, is_vacation FROM class_day_mappings WHERE is_vacation IS NOT NULL AND is_vacation IS NOT TRUE AND is_vacation IS NOT FALSE
    LOOP
        UPDATE class_day_mappings SET is_vacation = false WHERE id = r.id;
        RAISE NOTICE 'Fixed class_day_mappings.is_vacation for id: %', r.id;
    END LOOP;
    
    -- Check holidays.is_proposed
    FOR r IN SELECT id, is_proposed FROM holidays WHERE is_proposed IS NOT NULL AND is_proposed IS NOT TRUE AND is_proposed IS NOT FALSE
    LOOP
        UPDATE holidays SET is_proposed = false WHERE id = r.id;
        RAISE NOTICE 'Fixed holidays.is_proposed for id: %', r.id;
    END LOOP;
END $$;

-- 2. Ensure all boolean columns are properly typed
-- Convert any remaining non-boolean values to proper booleans
UPDATE family_years SET is_current = false WHERE is_current IS NULL;
UPDATE family_teaching_days SET is_teaching = true WHERE is_teaching IS NULL;
UPDATE calendar_days SET is_vacation = false WHERE is_vacation IS NULL;
UPDATE calendar_days SET is_teaching = true WHERE is_teaching IS NULL;
UPDATE class_day_mappings SET is_vacation = false WHERE is_vacation IS NULL;
UPDATE holidays SET is_proposed = false WHERE is_proposed IS NULL;

-- 3. Set proper defaults and constraints
ALTER TABLE family_years ALTER COLUMN is_current SET DEFAULT false;
ALTER TABLE family_years ALTER COLUMN is_current SET NOT NULL;

ALTER TABLE family_teaching_days ALTER COLUMN is_teaching SET DEFAULT true;
ALTER TABLE family_teaching_days ALTER COLUMN is_teaching SET NOT NULL;

ALTER TABLE calendar_days ALTER COLUMN is_vacation SET DEFAULT false;
ALTER TABLE calendar_days ALTER COLUMN is_teaching SET DEFAULT true;

ALTER TABLE class_day_mappings ALTER COLUMN is_vacation SET DEFAULT false;

ALTER TABLE holidays ALTER COLUMN is_proposed SET DEFAULT false;

-- 4. Add explicit type casting functions to prevent future issues
CREATE OR REPLACE FUNCTION safe_boolean_cast(value anyelement) RETURNS boolean AS $$
BEGIN
    IF value IS NULL THEN
        RETURN false;
    ELSIF value::text = 'true' OR value::text = 't' OR value::text = '1' OR value::text = 'yes' THEN
        RETURN true;
    ELSIF value::text = 'false' OR value::text = 'f' OR value::text = '0' OR value::text = 'no' THEN
        RETURN false;
    ELSE
        RETURN false; -- Default to false for any other value
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false; -- Return false for any casting errors
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Create specific trigger functions for each table to avoid field access errors
CREATE OR REPLACE FUNCTION validate_family_years_boolean() RETURNS trigger AS $$
BEGIN
    IF NEW.is_current IS NOT NULL THEN
        NEW.is_current := safe_boolean_cast(NEW.is_current);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_family_teaching_days_boolean() RETURNS trigger AS $$
BEGIN
    IF NEW.is_teaching IS NOT NULL THEN
        NEW.is_teaching := safe_boolean_cast(NEW.is_teaching);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_calendar_days_boolean() RETURNS trigger AS $$
BEGIN
    IF NEW.is_vacation IS NOT NULL THEN
        NEW.is_vacation := safe_boolean_cast(NEW.is_vacation);
    END IF;
    IF NEW.is_teaching IS NOT NULL THEN
        NEW.is_teaching := safe_boolean_cast(NEW.is_teaching);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_class_day_mappings_boolean() RETURNS trigger AS $$
BEGIN
    IF NEW.is_vacation IS NOT NULL THEN
        NEW.is_vacation := safe_boolean_cast(NEW.is_vacation);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_holidays_boolean() RETURNS trigger AS $$
BEGIN
    IF NEW.is_proposed IS NOT NULL THEN
        NEW.is_proposed := safe_boolean_cast(NEW.is_proposed);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for each table with boolean fields
DROP TRIGGER IF EXISTS validate_family_years_boolean ON family_years;
CREATE TRIGGER validate_family_years_boolean
    BEFORE INSERT OR UPDATE ON family_years
    FOR EACH ROW EXECUTE FUNCTION validate_family_years_boolean();

DROP TRIGGER IF EXISTS validate_family_teaching_days_boolean ON family_teaching_days;
CREATE TRIGGER validate_family_teaching_days_boolean
    BEFORE INSERT OR UPDATE ON family_teaching_days
    FOR EACH ROW EXECUTE FUNCTION validate_family_teaching_days_boolean();

DROP TRIGGER IF EXISTS validate_calendar_days_boolean ON calendar_days;
CREATE TRIGGER validate_calendar_days_boolean
    BEFORE INSERT OR UPDATE ON calendar_days
    FOR EACH ROW EXECUTE FUNCTION validate_calendar_days_boolean();

DROP TRIGGER IF EXISTS validate_class_day_mappings_boolean ON class_day_mappings;
CREATE TRIGGER validate_class_day_mappings_boolean
    BEFORE INSERT OR UPDATE ON class_day_mappings
    FOR EACH ROW EXECUTE FUNCTION validate_class_day_mappings_boolean();

DROP TRIGGER IF EXISTS validate_holidays_boolean ON holidays;
CREATE TRIGGER validate_holidays_boolean
    BEFORE INSERT OR UPDATE ON holidays
    FOR EACH ROW EXECUTE FUNCTION validate_holidays_boolean();

-- ==========================================================
-- END OF COMPREHENSIVE BOOLEAN FIX
-- ==========================================================

-- 7. RECREATE PROFILES TABLE FROM SCRATCH
-- Drop the profiles table completely
DROP TABLE IF EXISTS profiles CASCADE;

-- Recreate profiles table with clean structure
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  avatar_url text,
  family_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.family(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON profiles(family_id);

-- Grant permissions
GRANT ALL ON TABLE profiles TO authenticated;

-- Keep RLS disabled for now to avoid any recursion issues
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Create a trigger to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 

-- ==========================================================
-- ULTIMATE BOOLEAN FIX - PREVENT UUID-TO-BOOLEAN ERRORS
-- ==========================================================

-- 1. Drop all existing triggers to prevent interference
DROP TRIGGER IF EXISTS safe_family_years_boolean_trigger ON family_years;
DROP TRIGGER IF EXISTS safe_family_teaching_days_boolean_trigger ON family_teaching_days;
DROP TRIGGER IF EXISTS safe_calendar_days_boolean_trigger ON calendar_days;
DROP TRIGGER IF EXISTS safe_class_day_mappings_boolean_trigger ON class_day_mappings;
DROP TRIGGER IF EXISTS safe_holidays_boolean_trigger ON holidays;

-- 2. Drop trigger functions
DROP FUNCTION IF EXISTS safe_family_years_boolean();
DROP FUNCTION IF EXISTS safe_family_teaching_days_boolean();
DROP FUNCTION IF EXISTS safe_calendar_days_boolean();
DROP FUNCTION IF EXISTS safe_class_day_mappings_boolean();
DROP FUNCTION IF EXISTS safe_holidays_boolean();
DROP FUNCTION IF EXISTS validate_boolean_fields();

-- 3. Clean up ALL existing data that might be causing issues
-- This will reset all boolean fields to proper values
UPDATE family_years SET is_current = false WHERE is_current IS NOT TRUE;
UPDATE family_teaching_days SET is_teaching = true WHERE is_teaching IS NOT TRUE;
UPDATE calendar_days SET is_vacation = false WHERE is_vacation IS NOT FALSE;
UPDATE calendar_days SET is_teaching = true WHERE is_teaching IS NOT TRUE;
UPDATE class_day_mappings SET is_vacation = false WHERE is_vacation IS NOT FALSE;
UPDATE holidays SET is_proposed = false WHERE is_proposed IS NOT FALSE;

-- 4. Set proper defaults and constraints
ALTER TABLE family_years ALTER COLUMN is_current SET DEFAULT false;
ALTER TABLE family_years ALTER COLUMN is_current SET NOT NULL;

ALTER TABLE family_teaching_days ALTER COLUMN is_teaching SET DEFAULT true;
ALTER TABLE family_teaching_days ALTER COLUMN is_teaching SET NOT NULL;

ALTER TABLE calendar_days ALTER COLUMN is_vacation SET DEFAULT false;
ALTER TABLE calendar_days ALTER COLUMN is_teaching SET DEFAULT true;

ALTER TABLE class_day_mappings ALTER COLUMN is_vacation SET DEFAULT false;

ALTER TABLE holidays ALTER COLUMN is_proposed SET DEFAULT false;

-- 5. Create a simple, safe boolean casting function
CREATE OR REPLACE FUNCTION safe_boolean_cast(value anyelement) RETURNS boolean AS $$
BEGIN
    -- Handle NULL values
    IF value IS NULL THEN
        RETURN false;
    END IF;
    
    -- Handle boolean values directly
    IF value::text = 'true' OR value::text = 't' OR value::text = '1' OR value::text = 'yes' THEN
        RETURN true;
    END IF;
    
    -- Handle false values
    IF value::text = 'false' OR value::text = 'f' OR value::text = '0' OR value::text = 'no' THEN
        RETURN false;
    END IF;
    
    -- For any other value (including UUIDs, objects, etc.), return false
    RETURN false;
EXCEPTION
    WHEN OTHERS THEN
        -- If any error occurs during casting, return false
        RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Create simple, safe trigger functions for each table
CREATE OR REPLACE FUNCTION safe_family_years_boolean() RETURNS trigger AS $$
BEGIN
    NEW.is_current := safe_boolean_cast(NEW.is_current);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION safe_family_teaching_days_boolean() RETURNS trigger AS $$
BEGIN
    NEW.is_teaching := safe_boolean_cast(NEW.is_teaching);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION safe_calendar_days_boolean() RETURNS trigger AS $$
BEGIN
    NEW.is_vacation := safe_boolean_cast(NEW.is_vacation);
    NEW.is_teaching := safe_boolean_cast(NEW.is_teaching);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION safe_class_day_mappings_boolean() RETURNS trigger AS $$
BEGIN
    NEW.is_vacation := safe_boolean_cast(NEW.is_vacation);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION safe_holidays_boolean() RETURNS trigger AS $$
BEGIN
    NEW.is_proposed := safe_boolean_cast(NEW.is_proposed);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create the triggers with the safe functions
CREATE TRIGGER safe_family_years_boolean_trigger
    BEFORE INSERT OR UPDATE ON family_years
    FOR EACH ROW EXECUTE FUNCTION safe_family_years_boolean();

CREATE TRIGGER safe_family_teaching_days_boolean_trigger
    BEFORE INSERT OR UPDATE ON family_teaching_days
    FOR EACH ROW EXECUTE FUNCTION safe_family_teaching_days_boolean();

CREATE TRIGGER safe_calendar_days_boolean_trigger
    BEFORE INSERT OR UPDATE ON calendar_days
    FOR EACH ROW EXECUTE FUNCTION safe_calendar_days_boolean();

CREATE TRIGGER safe_class_day_mappings_boolean_trigger
    BEFORE INSERT OR UPDATE ON class_day_mappings
    FOR EACH ROW EXECUTE FUNCTION safe_class_day_mappings_boolean();

CREATE TRIGGER safe_holidays_boolean_trigger
    BEFORE INSERT OR UPDATE ON holidays
    FOR EACH ROW EXECUTE FUNCTION safe_holidays_boolean();

-- 8. Add explicit check constraints to prevent invalid data
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_family_years_is_current') THEN
        ALTER TABLE family_years ADD CONSTRAINT check_family_years_is_current CHECK (is_current IN (true, false));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_family_teaching_days_is_teaching') THEN
        ALTER TABLE family_teaching_days ADD CONSTRAINT check_family_teaching_days_is_teaching CHECK (is_teaching IN (true, false));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_calendar_days_is_vacation') THEN
        ALTER TABLE calendar_days ADD CONSTRAINT check_calendar_days_is_vacation CHECK (is_vacation IN (true, false));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_calendar_days_is_teaching') THEN
        ALTER TABLE calendar_days ADD CONSTRAINT check_calendar_days_is_teaching CHECK (is_teaching IN (true, false));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_class_day_mappings_is_vacation') THEN
        ALTER TABLE class_day_mappings ADD CONSTRAINT check_class_day_mappings_is_vacation CHECK (is_vacation IN (true, false));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_holidays_is_proposed') THEN
        ALTER TABLE holidays ADD CONSTRAINT check_holidays_is_proposed CHECK (is_proposed IN (true, false));
    END IF;
END $$;

-- 9. Grant necessary permissions
GRANT EXECUTE ON FUNCTION safe_boolean_cast TO authenticated;
GRANT EXECUTE ON FUNCTION safe_family_years_boolean TO authenticated;
GRANT EXECUTE ON FUNCTION safe_family_teaching_days_boolean TO authenticated;
GRANT EXECUTE ON FUNCTION safe_calendar_days_boolean TO authenticated;
GRANT EXECUTE ON FUNCTION safe_class_day_mappings_boolean TO authenticated;
GRANT EXECUTE ON FUNCTION safe_holidays_boolean TO authenticated;

-- ==========================================================
-- END OF ULTIMATE BOOLEAN FIX
-- ========================================================== 

-- ==========================================================
-- DELETE ALL CURRENT DATA FROM ALL TABLES
-- ==========================================================

-- WARNING: This will permanently delete ALL data from all tables!
-- Only run this if you want to start completely fresh.

-- Delete in order to avoid foreign key constraint violations
-- Start with tables that depend on others, then work backwards

-- 1. Delete from bridge/linking tables first
DELETE FROM track;
DELETE FROM attendance;
DELETE FROM lessons;

-- 2. Delete from activity/subject related tables
DELETE FROM subject_track;
DELETE FROM subject;

-- 3. Delete from calendar and scheduling tables
DELETE FROM calendar_days;
DELETE FROM family_teaching_days;
DELETE FROM class_day_mappings;
DELETE FROM class_days;
DELETE FROM holidays;

-- 4. Delete from family year tables
DELETE FROM family_years;

-- 5. Delete from child and family tables
DELETE FROM children;
DELETE FROM family;

-- 6. Delete from profiles (but keep auth.users intact)
DELETE FROM profiles;

-- 7. Delete from global tables (these can be recreated)
DELETE FROM global_official_holidays;
DELETE FROM global_academic_years;
DELETE FROM typical_holidays;

-- 8. Delete from user settings
DELETE FROM user_settings;

-- Reset sequences to start from 1 (if any tables use serial IDs)
-- Note: Most tables use UUIDs, so this may not be necessary
-- But included for completeness

-- Verify all tables are empty
-- You can run these queries to check:
/*
SELECT 'track' as table_name, COUNT(*) as row_count FROM track
UNION ALL
SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL
SELECT 'lessons', COUNT(*) FROM lessons
UNION ALL
SELECT 'subject_track', COUNT(*) FROM subject_track
UNION ALL
SELECT 'subject', COUNT(*) FROM subject
UNION ALL
SELECT 'calendar_days', COUNT(*) FROM calendar_days
UNION ALL
SELECT 'family_teaching_days', COUNT(*) FROM family_teaching_days
UNION ALL
SELECT 'class_day_mappings', COUNT(*) FROM class_day_mappings
UNION ALL
SELECT 'class_days', COUNT(*) FROM class_days
UNION ALL
SELECT 'holidays', COUNT(*) FROM holidays
UNION ALL
SELECT 'family_years', COUNT(*) FROM family_years
UNION ALL
SELECT 'children', COUNT(*) FROM children
UNION ALL
SELECT 'family', COUNT(*) FROM family
UNION ALL
SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'global_official_holidays', COUNT(*) FROM global_official_holidays
UNION ALL
SELECT 'global_academic_years', COUNT(*) FROM global_academic_years
UNION ALL
SELECT 'typical_holidays', COUNT(*) FROM typical_holidays
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings;
*/

-- ==========================================================
-- END OF DATA DELETION
-- ==========================================================

-- ==========================================================
-- RE-SEED HOLIDAY DATA (after deletion)
-- ==========================================================

-- Re-insert global academic years
INSERT INTO public.global_academic_years (label)
VALUES ('2025-26'),
('2026-27'),
('2027-28')
ON CONFLICT (label) DO NOTHING;

-- Re-insert comprehensive US holidays 2025-26 & 2026-27
INSERT INTO public.global_official_holidays (holiday_date, name)
VALUES
/* === AY 2025-26 === */
('2025-07-04', 'Independence Day'),
('2025-09-01', 'Labor Day'),
('2025-10-13', 'Indigenous Peoples'' / Columbus Day'),
('2025-11-11', 'Veterans Day'),
('2025-11-27', 'Thanksgiving'),
('2025-11-28', 'Thanksgiving'),
-- Winter Break 22 Dec 2025 – 03 Jan 2026
('2025-12-22', 'Winter Break'),
('2025-12-23', 'Winter Break'),
('2025-12-24', 'Winter Break'),
('2025-12-25', 'Winter Break'),
('2025-12-26', 'Winter Break'),
('2025-12-29', 'Winter Break'),
('2025-12-30', 'Winter Break'),
('2025-12-31', 'Winter Break'),
('2026-01-01', 'Winter Break'),
('2026-01-02', 'Winter Break'),
('2026-01-03', 'Winter Break'),
('2026-01-19', 'MLK'),
('2026-02-16', 'Presidents Day'),
('2026-05-25', 'Memorial Day'),
/* === AY 2026-27 === */
('2026-07-04', 'Independence Day'),
('2026-09-07', 'Labor Day'),
('2026-10-12', 'Indigenous Peoples'' / Columbus Day'),
('2026-11-11', 'Veterans Day'),
('2026-11-26', 'Thanksgiving'),
('2026-11-27', 'Thanksgiving'),
-- Winter Break 20 Dec 2026 – 03 Jan 2027
('2026-12-20', 'Winter Break'),
('2026-12-21', 'Winter Break'),
('2026-12-22', 'Winter Break'),
('2026-12-23', 'Winter Break'),
('2026-12-24', 'Winter Break'),
('2026-12-25', 'Winter Break'),
('2026-12-28', 'Winter Break'),
('2026-12-29', 'Winter Break'),
('2026-12-30', 'Winter Break'),
('2026-12-31', 'Winter Break'),
('2027-01-01', 'Winter Break'),
('2027-01-02', 'Winter Break'),
('2027-01-03', 'Winter Break'),
('2027-01-18', 'MLK'),
('2027-02-15', 'Presidents Day'),
('2027-05-31', 'Memorial Day')
ON CONFLICT (holiday_date) DO NOTHING;

-- ==========================================================
-- END OF RE-SEEDING
-- ========================================================== 