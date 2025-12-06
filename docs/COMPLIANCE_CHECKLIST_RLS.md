# Compliance Checklist RLS Policies & Permissions

## Overview
The `family_compliance_checklist` table needs proper RLS (Row Level Security) policies to allow family members to view and manage compliance checklist items.

## Current Issue
The existing RLS policies use complex EXISTS subqueries that may fail if:
- `family_members` table doesn't exist or has RLS issues
- `profiles` table has RLS recursion issues
- The policies are too restrictive

## Solution
Use the `is_family_member()` helper function which is simpler and more reliable.

## Required RLS Policies

### 1. SELECT Policy (View)
```sql
CREATE POLICY "Family members can view compliance checklist" 
ON family_compliance_checklist
FOR SELECT
TO authenticated
USING (is_family_member(family_id));
```

**What it does:**
- Allows any authenticated user who is a member of the family to view checklist items
- Uses the `is_family_member()` helper function for consistent checking

### 2. INSERT Policy (Create)
```sql
CREATE POLICY "Family members can insert compliance checklist" 
ON family_compliance_checklist
FOR INSERT
TO authenticated
WITH CHECK (is_family_member(family_id));
```

**What it does:**
- Allows family members to create new checklist items
- Ensures `family_id` matches the user's family

### 3. UPDATE Policy (Modify)
```sql
CREATE POLICY "Family members can update compliance checklist" 
ON family_compliance_checklist
FOR UPDATE
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));
```

**What it does:**
- Allows family members to update existing checklist items
- `USING` clause checks existing row belongs to family
- `WITH CHECK` clause ensures updated row still belongs to family

### 4. DELETE Policy (Remove)
```sql
CREATE POLICY "Family members can delete compliance checklist" 
ON family_compliance_checklist
FOR DELETE
TO authenticated
USING (is_family_member(family_id));
```

**What it does:**
- Allows family members to delete checklist items
- Only for items belonging to their family

## Required Permissions

### For Authenticated Users
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO authenticated;
```

### For Service Role (Backend API)
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO service_role;
```

**Why service_role?**
- Backend API uses service_role to bypass RLS when needed
- Allows backend to perform operations on behalf of users
- Still respects business logic validation

## is_family_member() Function

The helper function checks if the current user belongs to a family:

```sql
CREATE OR REPLACE FUNCTION is_family_member(_family uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND family_id = _family
  )
  OR EXISTS (
    SELECT 1
    FROM family_members
    WHERE user_id = auth.uid()
      AND family_id = _family
  );
$$;
```

**Why SECURITY DEFINER?**
- Runs with the privileges of the function creator (usually postgres/admin)
- Allows checking `profiles` and `family_members` tables even if they have RLS
- Prevents recursion issues

## Testing RLS Policies

### Test 1: User can view their family's checklist
```sql
-- As authenticated user
SELECT * FROM family_compliance_checklist 
WHERE family_id = (SELECT family_id FROM profiles WHERE id = auth.uid());
-- Should return rows
```

### Test 2: User cannot view other family's checklist
```sql
-- As authenticated user
SELECT * FROM family_compliance_checklist 
WHERE family_id != (SELECT family_id FROM profiles WHERE id = auth.uid());
-- Should return empty (0 rows)
```

### Test 3: User can insert checklist item
```sql
-- As authenticated user
INSERT INTO family_compliance_checklist (family_id, child_id, state_code, requirement_id, status)
VALUES (
  (SELECT family_id FROM profiles WHERE id = auth.uid()),
  'some-child-id',
  'CA',
  'some-requirement-id',
  'pending'
);
-- Should succeed
```

### Test 4: User cannot insert for other family
```sql
-- As authenticated user (should fail)
INSERT INTO family_compliance_checklist (family_id, child_id, state_code, requirement_id, status)
VALUES (
  'different-family-id', -- Not user's family
  'some-child-id',
  'CA',
  'some-requirement-id',
  'pending'
);
-- Should fail with permission denied
```

## Common Issues & Fixes

### Issue 1: 500 Error - Permission Denied
**Cause:** RLS policies not configured or `is_family_member` function missing

**Fix:** Run the migration script `2025-01-24_fix_compliance_checklist_rls.sql`

### Issue 2: Can't Insert Checklist Items
**Cause:** INSERT policy missing or too restrictive

**Fix:** Ensure INSERT policy exists and uses `WITH CHECK (is_family_member(family_id))`

### Issue 3: Can't See Checklist Items
**Cause:** SELECT policy missing or user not in family

**Fix:** 
1. Check SELECT policy exists
2. Verify user's `profiles.family_id` matches checklist `family_id`
3. Check `family_members` table if using that for membership

### Issue 4: Recursion Error
**Cause:** RLS policy queries `profiles` table which also has RLS

**Fix:** Use `is_family_member()` function with `SECURITY DEFINER` to avoid recursion

## Migration Script

Run this SQL migration to fix RLS policies:

```sql
-- File: 2025-01-24_fix_compliance_checklist_rls.sql
-- This script updates RLS policies to use is_family_member() helper
```

## Verification

After running the migration, verify:

1. ✅ Policies exist:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'family_compliance_checklist';
   ```

2. ✅ RLS is enabled:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables 
   WHERE tablename = 'family_compliance_checklist';
   -- rowsecurity should be true
   ```

3. ✅ Permissions granted:
   ```sql
   SELECT grantee, privilege_type 
   FROM information_schema.role_table_grants 
   WHERE table_name = 'family_compliance_checklist';
   ```

## Summary

**Required:**
- ✅ RLS enabled on table
- ✅ SELECT, INSERT, UPDATE, DELETE policies using `is_family_member(family_id)`
- ✅ GRANT permissions to `authenticated` and `service_role` roles
- ✅ `is_family_member()` function exists and works

**Pattern:**
All family-scoped tables should use the same pattern:
- `USING (is_family_member(family_id))` for SELECT/DELETE
- `WITH CHECK (is_family_member(family_id))` for INSERT/UPDATE

