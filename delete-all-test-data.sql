-- Delete all test data safely
-- This script deletes data in the correct order to avoid foreign key violations

-- WARNING: This will permanently delete ALL data from all tables!
-- Only run this if you want to start completely fresh.

-- 1. First, disable triggers temporarily to avoid interference
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_signup ON auth.users;

-- 2. Delete from bridge/linking tables first (they depend on other tables)
DELETE FROM track;
DELETE FROM attendance;
DELETE FROM lessons;

-- 3. Delete from activity/subject related tables
DELETE FROM subject_track;
DELETE FROM subject;

-- 4. Delete from calendar and scheduling tables
DELETE FROM calendar_days;
DELETE FROM family_teaching_days;
DELETE FROM class_day_mappings;
DELETE FROM class_days;
DELETE FROM holidays;

-- 5. Delete from family year tables
DELETE FROM family_years;

-- 6. Delete from child and family tables
DELETE FROM children;
DELETE FROM family;

-- 7. Delete from profiles (but keep auth.users intact for now)
DELETE FROM profiles;

-- 8. Delete from global tables (these can be recreated)
DELETE FROM global_official_holidays;
DELETE FROM global_academic_years;
DELETE FROM typical_holidays;

-- 9. Delete from user settings
DELETE FROM user_settings;

-- 10. Now delete from auth.users (this will remove the actual user accounts)
-- Note: This requires admin privileges and will remove all authentication data
-- Uncomment the next line if you want to delete auth users too:
-- DELETE FROM auth.users;

-- 11. Recreate the trigger function and trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_family_id uuid;
  user_full_name text;
BEGIN
  -- Get user's full name from metadata or use email as fallback
  user_full_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );
  
  -- Create a new family for this user
  INSERT INTO public.family (id, name, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    user_full_name || '''s Family',
    now(),
    now()
  )
  RETURNING id INTO new_family_id;
  
  -- Create the profile and link it to the family
  INSERT INTO public.profiles (id, email, full_name, avatar_url, family_id)
  VALUES (
    new.id, 
    new.email, 
    user_full_name,
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    new_family_id
  );
  
  -- Log the successful creation
  RAISE NOTICE 'Created family % for user % with name %', new_family_id, new.id, user_full_name;
  
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create family/profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 13. Grant permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- 14. Verify all tables are empty
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

-- 15. Show auth users count (if you want to see how many auth users remain)
SELECT 'auth.users count: ' || COUNT(*) as auth_users_count FROM auth.users;

-- 16. Success message
SELECT 'All test data deleted successfully!' as status;
SELECT 'Database is now clean and ready for fresh testing.' as status; 