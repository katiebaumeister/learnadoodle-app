-- Check Subject Track Table Structure
-- This script shows the exact columns in the subject_track table

SELECT '=== SUBJECT TRACK TABLE STRUCTURE ===' as info;

-- Check the exact columns in the subject_track table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'subject_track'
ORDER BY ordinal_position;

-- Check existing data to see what columns are populated
SELECT '=== EXISTING DATA SAMPLE ===' as info;

SELECT 
    'Sample Record:' as test,
    *
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
LIMIT 1;

-- Check if we need to add missing columns
SELECT '=== COLUMN ANALYSIS ===' as info;

SELECT 
    'Missing Columns Check:' as test,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'class_schedule') 
        THEN 'class_schedule: EXISTS' 
        ELSE 'class_schedule: MISSING' 
    END as class_schedule_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'study_days') 
        THEN 'study_days: EXISTS' 
        ELSE 'study_days: MISSING' 
    END as study_days_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'roadmap') 
        THEN 'roadmap: EXISTS' 
        ELSE 'roadmap: MISSING' 
    END as roadmap_status;
