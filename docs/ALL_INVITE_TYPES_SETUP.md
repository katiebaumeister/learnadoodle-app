# All Invite Types Setup - Parent, Tutor, and Child

## Overview

The invite system supports three types of invites:
1. **Parent invites** - Share family access with another parent
2. **Tutor invites** - Give tutors access to specific children
3. **Child invites** - Give children their own login account

All three use the same underlying `accept_invite` RPC function, which properly sets up `family_members` entries.

## Parent Invites

### Flow

1. **Parent creates invite**:
   - UI: Parent clicks "+ Invite Parent" in Family Members page
   - Backend: `POST /api/family/invite` or `POST /api/invite/create`
   - Creates invite with:
     - `role = 'parent'`
     - `child_scope = []` (empty - parents see all children)
     - `family_id` = current family

2. **Invited parent accepts**:
   - User must already have an account (logs in first)
   - Backend: `POST /api/invite/accept`
   - Calls `accept_invite` RPC function
   - Creates `family_members` entry:
     ```sql
     family_members:
       - family_id: 'xxx'
       - user_id: invited_user_id
       - member_role: 'parent'
       - child_scope: []  ← Empty (sees all children)
       - child_id: NULL   ← Not applicable for parents
     ```
   - Updates `profiles`:
     ```sql
     profiles:
       - family_id: 'xxx'
       - role: 'parent'
     ```

3. **Result**:
   - Parent can see all children in the family
   - `get_accessible_children()` returns all children in family
   - Full access to all family data

### Verification

```sql
-- Check parent invite acceptance
SELECT 
  p.email,
  p.role,
  fm.member_role,
  fm.child_scope,
  fm.child_id,
  CASE 
    WHEN fm.child_scope = '{}' THEN '✅ Correct (empty for parents)'
    ELSE '❌ Should be empty'
  END as status
FROM profiles p
JOIN family_members fm ON fm.user_id = p.id
WHERE p.role = 'parent'
  AND fm.member_role = 'parent';
```

## Tutor Invites

### Flow

1. **Parent creates tutor invite**:
   - UI: Parent clicks "+ Invite Tutor" and selects which children
   - Backend: `POST /api/family/invite` or `POST /api/invite/create`
   - Creates invite with:
     - `role = 'tutor'`
     - `child_scope = [child_id1, child_id2, ...]` (selected children)
     - `family_id` = current family

2. **Tutor accepts invite**:
   - User must already have an account (logs in first)
   - Backend: `POST /api/invite/accept`
   - Calls `accept_invite` RPC function
   - Creates `family_members` entry:
     ```sql
     family_members:
       - family_id: 'xxx'
       - user_id: tutor_user_id
       - member_role: 'tutor'
       - child_scope: ['child_id1', 'child_id2']  ← Selected children
       - child_id: NULL  ← Not applicable for tutors
     ```
   - Updates `profiles`:
     ```sql
     profiles:
       - family_id: 'xxx'
       - role: 'tutor'
     ```

3. **Result**:
   - Tutor can only see children in their `child_scope`
   - `get_accessible_children()` returns only children in `child_scope`
   - Limited access based on `child_scope`

### Verification

```sql
-- Check tutor invite acceptance
SELECT 
  p.email,
  p.role,
  fm.member_role,
  fm.child_scope,
  fm.child_id,
  array_length(fm.child_scope, 1) as child_count,
  CASE 
    WHEN array_length(fm.child_scope, 1) > 0 THEN '✅ Correct (has child_scope)'
    ELSE '❌ Should have child_scope'
  END as status
FROM profiles p
JOIN family_members fm ON fm.user_id = p.id
WHERE p.role = 'tutor'
  AND fm.member_role = 'tutor';
```

## Child Invites

### Flow

1. **Parent creates child invite**:
   - UI: Parent clicks "+ Invite Child" and selects a child
   - Backend: `POST /api/child/create_invite` (creates new account)
   - OR: `POST /api/invite/create` with `role='child'` (existing user)
   - Creates invite with:
     - `role = 'child'`
     - `child_id` = selected child's ID
     - `child_scope = [child_id]` (only themselves)
     - `family_id` = current family

2. **Child accepts invite**:
   - **Option A**: New account (via `/api/child/accept_invite`)
     - Creates new Supabase auth user
     - Creates `profiles` entry
     - Creates `family_members` entry with `child_id` and `child_scope`
   
   - **Option B**: Existing user (via `/api/invite/accept`)
     - User already logged in
     - Calls `accept_invite` RPC function
     - Updates `profiles` and creates `family_members` entry

3. **Result**:
   - Child can only see their own data
   - `get_accessible_children()` returns only their own child record
   - Filtered access based on `child_id`

### Verification

```sql
-- Check child invite acceptance
SELECT 
  p.email,
  p.role,
  fm.member_role,
  fm.child_id,
  fm.child_scope,
  c.id as child_record_id,
  c.first_name,
  CASE 
    WHEN fm.child_id = c.id AND fm.child_scope = ARRAY[c.id] THEN '✅ Correctly linked'
    ELSE '❌ Missing link'
  END as status
FROM profiles p
JOIN family_members fm ON fm.user_id = p.id
LEFT JOIN children c ON c.id = fm.child_id
WHERE p.role = 'child'
  AND fm.member_role = 'child';
```

## How `get_accessible_children()` Works for Each Role

The function returns different results based on role:

### Parents
```sql
-- Returns ALL children in family
SELECT c.id, c.family_id
FROM children c
JOIN family_members fm ON fm.family_id = c.family_id
WHERE fm.user_id = _user_id
  AND fm.member_role = 'parent'
  AND c.archived = false
```

### Tutors
```sql
-- Returns ONLY children in child_scope
SELECT unnest(fm.child_scope) AS child_id, fm.family_id
FROM family_members fm
WHERE fm.user_id = _user_id
  AND fm.member_role = 'tutor'
  AND array_length(fm.child_scope, 1) > 0
```

### Children/Students
```sql
-- Returns ONLY themselves
SELECT COALESCE(fm.child_id, fm.child_scope[1]) AS child_id, fm.family_id
FROM family_members fm
WHERE fm.user_id = _user_id
  AND fm.member_role IN ('child', 'student')
  AND (fm.child_id IS NOT NULL OR array_length(fm.child_scope, 1) > 0)
```

## Complete Setup Status

### ✅ Parent Invites
- [x] Invite creation stores `role='parent'` and `child_scope=[]`
- [x] `accept_invite` RPC creates `family_members` with correct values
- [x] `get_accessible_children()` returns all family children
- [x] Frontend uses `accessible_children` to show all children

### ✅ Tutor Invites
- [x] Invite creation stores `role='tutor'` and `child_scope=[selected_children]`
- [x] `accept_invite` RPC creates `family_members` with correct `child_scope`
- [x] `get_accessible_children()` returns only children in `child_scope`
- [x] Frontend uses `accessible_children` to filter data

### ✅ Child Invites
- [x] Invite creation stores `role='child'`, `child_id`, and `child_scope=[child_id]`
- [x] `accept_child_invite` creates `family_members` with both `child_id` and `child_scope`
- [x] `accept_invite` RPC also handles child invites for existing users
- [x] `get_accessible_children()` returns only the child's own record
- [x] Frontend uses `accessible_children[0].id` to filter data

## Summary

**Yes, the invite system works for all three types!** ✅

The `accept_invite` RPC function properly handles:
- **Parents**: Sets `child_scope=[]` and `child_id=NULL` ✅
- **Tutors**: Sets `child_scope=[selected_children]` and `child_id=NULL` ✅
- **Children**: Sets `child_scope=[child_id]` and `child_id=child_id` ✅

All three roles are properly linked to the family and have correct permissions set up.
