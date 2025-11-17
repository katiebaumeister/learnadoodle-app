# Activity Instances RLS Implementation Guide

## Overview
This guide explains how to implement Row Level Security (RLS) for the `activity_instances` table and ensure the application code complies with the security requirements.

## Current Status
- ✅ Table structure is properly set up with `family_id` foreign key
- ✅ Application code already uses `family_id: familyId` in all insert operations
- ❌ RLS is currently disabled on the table
- ❌ No RLS policies exist

## Implementation Steps

### 1. Run the RLS Setup Script
Execute the `setup-activity-instances-rls.sql` script to:
- Enable RLS on the table
- Create comprehensive family-based access policies
- Grant proper permissions to authenticated users

```sql
-- Run this script in your Supabase SQL editor
\i setup-activity-instances-rls.sql
```

### 2. Validate the Setup
Execute the validation script to ensure everything is working correctly:

```sql
-- Run this script to verify the setup
\i validate-activity-instances-compliance.sql
```

### 3. Test the Implementation
After enabling RLS, test that:
- Users can only see their own family's activity instances
- Users can insert new activity instances (they will automatically be assigned their family_id)
- Users can update/delete only their own family's activity instances
- Cross-family access is blocked

## RLS Policy Details

### Policy Name: `activity_instances_family_policy`
- **Scope**: All operations (SELECT, INSERT, UPDATE, DELETE)
- **Logic**: Users can only access records where `family_id` matches their profile's `family_id`
- **Security**: Uses `auth.uid()` to get current user and joins with `profiles` table

### Policy Logic:
```sql
USING (
    auth.role() = 'authenticated' AND
    family_id IN (
        SELECT family_id FROM profiles 
        WHERE id = auth.uid()
    )
)
WITH CHECK (
    auth.role() = 'authenticated' AND
    family_id IN (
        SELECT family_id FROM profiles 
        WHERE id = auth.uid()
    )
)
```

## Code Compliance Verification

### ✅ Already Compliant Operations

#### Insert Operations
All insert operations already include `family_id: familyId`:
- `saveHomeEvent()` - Home page modal
- `saveNewEventFromForm()` - Calendar right pane
- `handlePasteEvent()` - Copy/paste functionality
- `handleDuplicateEvent()` - Duplicate functionality

#### Select Operations
All select operations already filter by `family_id`:
- `preloadCalendarData()` - Calendar data loading
- `fetchTodaysLearning()` - Home page events

#### Update/Delete Operations
These operations use `id` matching, which works with RLS because:
- The policy ensures users can only see/modify their family's records
- The `id` filter is applied after the RLS policy filters by `family_id`

### 🔧 Code Patterns That Work with RLS

#### 1. Insert Pattern (Already Used)
```javascript
const eventData = {
  family_id: familyId,  // ✅ Required for RLS
  title: 'Lesson Title',
  // ... other fields
};

await supabase
  .from('activity_instances')
  .insert([eventData]);
```

#### 2. Select Pattern (Already Used)
```javascript
await supabase
  .from('activity_instances')
  .select('*')
  .eq('family_id', familyId)  // ✅ Explicit family filtering
  .eq('scheduled_date', date);
```

#### 3. Update Pattern (Already Used)
```javascript
await supabase
  .from('activity_instances')
  .update(changes)
  .eq('id', eventId);  // ✅ Works with RLS (policy filters by family_id)
```

#### 4. Delete Pattern (Already Used)
```javascript
await supabase
  .from('activity_instances')
  .delete()
  .eq('id', eventId);  // ✅ Works with RLS (policy filters by family_id)
```

## Security Benefits

### Before RLS
- ❌ Any authenticated user could potentially access any activity instance
- ❌ No automatic data isolation between families
- ❌ Relied entirely on application-level filtering

### After RLS
- ✅ Automatic data isolation at the database level
- ✅ Users can only access their own family's data
- ✅ Protection against application bugs or security vulnerabilities
- ✅ Compliance with data privacy requirements

## Troubleshooting

### Common Issues

#### 1. "Permission denied" errors
**Cause**: RLS policy is too restrictive or user doesn't have proper profile
**Solution**: 
- Verify user has a profile with valid `family_id`
- Check that RLS policy syntax is correct
- Ensure user is authenticated

#### 2. Empty results after enabling RLS
**Cause**: User's `family_id` doesn't match any records
**Solution**:
- Check user's profile has correct `family_id`
- Verify existing records have proper `family_id` values
- Run validation script to check data integrity

#### 3. Insert failures
**Cause**: Missing `family_id` in insert data
**Solution**:
- Ensure all insert operations include `family_id: familyId`
- Verify `familyId` state variable is properly set

### Debugging Queries
Use these queries to debug RLS issues:

```sql
-- Check current user context
SELECT auth.uid() as user_id, auth.role() as role;

-- Check user's profile
SELECT * FROM profiles WHERE id = auth.uid();

-- Check user's family
SELECT f.* FROM family f 
JOIN profiles p ON f.id = p.family_id 
WHERE p.id = auth.uid();

-- Test RLS policy logic
SELECT * FROM activity_instances 
WHERE family_id IN (
    SELECT family_id FROM profiles 
    WHERE id = auth.uid()
);
```

## Migration Checklist

- [ ] Run `setup-activity-instances-rls.sql`
- [ ] Run `validate-activity-instances-compliance.sql`
- [ ] Test insert operations from the app
- [ ] Test update operations from the app
- [ ] Test delete operations from the app
- [ ] Verify cross-family access is blocked
- [ ] Test with different user accounts
- [ ] Monitor application logs for any RLS-related errors

## Rollback Plan
If issues occur, you can temporarily disable RLS:
```sql
ALTER TABLE activity_instances DISABLE ROW LEVEL SECURITY;
```

However, this should only be used for debugging - RLS should remain enabled for production security.
