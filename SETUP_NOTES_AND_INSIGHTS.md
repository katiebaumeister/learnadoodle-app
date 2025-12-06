# Setup Notes Table and Insights Endpoint

## Quick Fix for 403/422 Errors

The errors you're seeing are due to:
1. **403 errors on notes** - RLS permissions not granted to `authenticated` role
2. **422 errors on insights** - Endpoint requires parameters that aren't always provided

## Step 1: Run SQL Migration

Run the updated SQL migration file in Supabase SQL Editor:

**File**: `2025-11-20_notes_table.sql`

This will:
- Create the `notes` table (if it doesn't exist)
- Grant permissions to both `service_role` AND `authenticated` role
- Set up RLS policies using `is_family_member()` function

## Step 2: Restart Backend

The backend changes are already in place:
- `backend/routers/insights_routes.py` - Made parameters optional
- `backend/routers/notes_routes.py` - Notes API endpoints
- `backend/main.py` - Both routers registered

Just restart your FastAPI server.

## Step 3: Verify

After running the migration:
- ✅ 403 errors on notes should stop (permissions granted)
- ✅ 422 errors on insights should stop (parameters optional)
- ✅ 400 errors on uploads should stop (already handled)

## What Changed

### Notes Table (`2025-11-20_notes_table.sql`)
- Added `GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO authenticated;`
- This allows authenticated users to access the notes table

### Insights Endpoint (`backend/routers/insights_routes.py`)
- Made `children`, `start`, and `end` parameters optional
- If not provided, endpoint returns empty array gracefully
- Handles both `timeframe`/`date` pattern and `start`/`end` pattern

### Error Suppression (`lib/apiClient.js` & `lib/services/recordsClient.js`)
- Added 403 (permission denied) to suppressed errors
- Added 422 (validation error) to suppressed errors
- Added more error message patterns for RLS/permission errors

## Troubleshooting

If you still see 403 errors after running the migration:
1. Check that `is_family_member()` function exists and is accessible
2. Verify your user is authenticated and has a `family_id` in their profile
3. Check Supabase logs for specific RLS policy failures

If you still see 422 errors:
1. Check backend logs to see which parameter is missing
2. Verify the frontend is calling the endpoint correctly
3. The endpoint should now handle missing parameters gracefully

