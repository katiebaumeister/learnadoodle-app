# Database Setup Instructions

## Quick Setup (3 steps)

### Step 1: Run the main SQL file
1. Open your **Supabase Dashboard**
2. Go to **SQL Editor**
3. Copy and paste the entire contents of `setup-all-systems.sql`
4. Click **Run**

### Step 2: Create the storage bucket
1. In your Supabase Dashboard, go to **Storage** (left sidebar)
2. Click **New bucket**
3. Name it: `evidence`
4. Make it **Private** (uncheck "Public bucket")
5. Click **Create bucket**

### Step 3: Refresh your app
Reload your application - all the 404 errors should be gone!

## What This Sets Up

### ✅ Attendance System
- `attendance_records` table
- Automatic attendance tracking from completed events
- RPCs: `upsert_attendance`, `get_attendance_range`, `get_attendance_summary`

### ✅ Uploads System
- `uploads` table
- Storage bucket RLS policies
- RPCs: `create_upload_record`, `get_uploads`

### ✅ Lesson Plans System
- `lesson_plans`, `lesson_plan_steps`, `child_plan_links` tables
- RPCs: `create_lesson_plan`, `get_lesson_plans`, `instantiate_plan_to_week`

## Troubleshooting

### If you get availability function errors:
If you see errors like:
- `column av.start_time does not exist`
- `column ca.available_blocks does not exist`
- `function get_child_availability does not exist`

Run this additional SQL file in Supabase SQL Editor:
```
update-availability-functions.sql
```

This will update the availability functions to match the expected structure.

### If you get "function already exists" errors:
The SQL file includes `DROP FUNCTION IF EXISTS` statements, so it should handle this automatically.

### If you get "table already exists" errors:
The SQL file uses `CREATE TABLE IF NOT EXISTS`, so this is safe to ignore.

### If you get "subjects table does not exist" errors:
The SQL has been updated to NOT require a subjects table. The `subject_id` fields are nullable and don't have foreign key constraints.

## After Setup

Your new screens will be fully functional:
- 📊 **Records → Attendance**: Month grid with status tracking
- 📁 **Documents**: File upload and management
- 📚 **Lesson Plans**: Template creation and auto-scheduling
- 📈 **Records → Reports**: CSV export and analytics

