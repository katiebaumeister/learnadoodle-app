# Debugging Scheduling Assistant - Busy Intervals Not Showing

## Issue
The Scheduling Assistant is returning 0 busy intervals even though there are scheduled events in the database.

## Changes Made

### 1. SQL Function Fix (Migration File)
- Added explicit column aliases in `get_busy_intervals` function
- File: `hi-world-app/supabase/migrations/20250120_scheduling_assistant_tables.sql`
- Change: `e.start_ts AS start_at, e.end_ts AS end_at`

### 2. Backend Debug Logging
- Added comprehensive logging in `scheduling_assistant_routes.py`
- Logs show:
  - Total events for the family
  - Which events overlap the time range
  - Which events match the child_id
  - Which events are valid (not backlog, not canceled, not deleted)
  - Final count of valid overlapping events

## Steps to Debug

### Step 1: Apply the Migration
Run the migration to update the SQL function:

```bash
# If using Supabase CLI
supabase db push

# Or apply the migration manually in Supabase Dashboard
# Go to SQL Editor and run the contents of:
# hi-world-app/supabase/migrations/20250120_scheduling_assistant_tables.sql
```

### Step 2: Check Backend Logs
When you open the Scheduling Assistant, check your backend logs. You should see output like:

```
[get_availability] Calling get_busy_intervals with family_id=..., child_id=..., start=..., end=...
[get_availability] Total events for family: X
[get_availability] Event <id> '<title>': overlaps=True, matches_child=True, is_valid=True, child_id=..., is_backlog=..., status=..., deleted_at=...
[get_availability] Found X valid overlapping events for child <child_id>
[get_availability] RPC returned X raw intervals: [...]
```

### Step 3: Analyze the Logs
Look for:
- **Total events for family**: Should be > 0 if events exist
- **Overlaps**: Are events overlapping the time range?
- **matches_child**: Are events matching the child_id or are family-wide (child_id IS NULL)?
- **is_valid**: Are events being filtered out because:
  - `is_backlog = true` (should be false or NULL)
  - `status = 'canceled'` (should not be canceled)
  - `deleted_at IS NOT NULL` (should be NULL)
- **RPC returned**: What does the SQL function return?

### Step 4: Common Issues

#### Issue: Events have `is_backlog = true`
**Solution**: These are backlog items, not scheduled events. They should be excluded.

#### Issue: Events have `status = 'canceled'`
**Solution**: Canceled events are correctly excluded.

#### Issue: Events have `deleted_at IS NOT NULL`
**Solution**: Soft-deleted events are correctly excluded.

#### Issue: Events don't match `child_id`
**Solution**: Check if events are family-wide (`child_id IS NULL`). The function should include these.

#### Issue: Events don't overlap time range
**Solution**: Check the time range being passed:
- `weekStart`: Should be start of week in UTC
- `weekEnd`: Should be end of week in UTC
- Events are stored in UTC as `TIMESTAMPTZ`

## Testing the SQL Function Directly

You can test the SQL function directly in Supabase SQL Editor:

```sql
SELECT * FROM get_busy_intervals(
  'your-family-id'::uuid,
  'your-child-id'::uuid,
  '2026-01-18T05:00:00Z'::timestamptz,
  '2026-01-25T04:59:59Z'::timestamptz
);
```

Replace with your actual:
- `family_id`
- `child_id`
- `weekStart` (in UTC)
- `weekEnd` (in UTC)

## Next Steps

1. Apply the migration
2. Open Scheduling Assistant
3. Check backend logs
4. Share the log output if issues persist
