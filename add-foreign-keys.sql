-- Add Foreign Key Constraints for Calendar Tables
-- This script adds proper foreign key relationships

-- 1. Add foreign key for class_days.academic_year_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_class_days_academic_year_id'
    ) THEN
        ALTER TABLE class_days 
        ADD CONSTRAINT fk_class_days_academic_year_id 
        FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Add foreign key for holidays.academic_year_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_holidays_academic_year_id'
    ) THEN
        ALTER TABLE holidays 
        ADD CONSTRAINT fk_holidays_academic_year_id 
        FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Add foreign key for class_day_mappings.academic_year_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_class_day_mappings_academic_year_id'
    ) THEN
        ALTER TABLE class_day_mappings 
        ADD CONSTRAINT fk_class_day_mappings_academic_year_id 
        FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Add foreign key for lessons.academic_year_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_lessons_academic_year_id'
    ) THEN
        ALTER TABLE lessons 
        ADD CONSTRAINT fk_lessons_academic_year_id 
        FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Add foreign key for attendance.child_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_attendance_child_id'
    ) THEN
        ALTER TABLE attendance 
        ADD CONSTRAINT fk_attendance_child_id 
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 6. Add foreign key for academic_years.family_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_academic_years_family_id'
    ) THEN
        ALTER TABLE academic_years 
        ADD CONSTRAINT fk_academic_years_family_id 
        FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Show the foreign key constraints
SELECT 'FOREIGN KEY CONSTRAINTS:' as info;
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY tc.table_name, kcu.column_name;

SELECT 'Foreign key constraints added successfully!' as status; 