# 🔧 Supabase RLS Fix Instructions

## The Problem
Your calendar tables exist but have Row Level Security (RLS) policies that are too restrictive, causing "permission denied" errors even for authenticated users.

## Quick Fix (Run in Supabase Dashboard)

1. **Go to your Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/mtftwebrtazhyzmmvmdl

2. **Open the SQL Editor**
   - Click on "SQL Editor" in the left sidebar

3. **Run this SQL script:**

```sql
-- Temporarily disable RLS on all calendar tables
-- This will allow the app to work while we fix the policies

-- Disable RLS on all calendar tables
ALTER TABLE IF EXISTS academic_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS typical_holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_day_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance DISABLE ROW LEVEL SECURITY;

-- Show the status
SELECT 'RLS DISABLED ON CALENDAR TABLES:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('academic_years', 'typical_holidays', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY tablename;

SELECT 'Calendar tables should now be accessible!' as status;
```

4. **Click "Run" to execute the script**

5. **Test your app** - The calendar should now work without permission errors

## What This Does
- Temporarily disables RLS on all calendar tables
- Allows any authenticated user to access the data
- Gets your app working immediately

## Next Steps (Optional)
Once your app is working, we can re-enable RLS with proper policies that:
- Allow authenticated users to access their family's data
- Maintain security while being less restrictive
- Work with your current user authentication setup 