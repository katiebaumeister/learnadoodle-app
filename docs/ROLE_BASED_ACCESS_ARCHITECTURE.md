# Role-Based Access Control Architecture

## Overview

This document explains the database architecture needed for role-based rendering and permission-based data access, where parents and children use individual emails to log in but share a `family_id`.

## Database Tables Required

### 1. `profiles` Table
**Purpose**: Links user accounts (email/auth.users) to families

**Key Columns**:
- `id` (UUID, PRIMARY KEY) - References `auth.users(id)`
- `email` (TEXT) - User's email address
- `family_id` (UUID) - References `family(id)` - **Links user to family**
- `role` (TEXT) - Optional: `'parent'`, `'child'`, `'student'`, `'tutor'` (defaults to `'parent'`)
- `full_name`, `first_name`, `name` (TEXT) - User's name
- `avatar_url` (TEXT) - Profile picture

**Current Status**: ✅ Exists

### 2. `family_members` Table
**Purpose**: Explicitly tracks family membership and roles (preferred method)

**Key Columns**:
- `id` (UUID, PRIMARY KEY)
- `family_id` (UUID, NOT NULL) - References `family(id)`
- `user_id` (UUID, NOT NULL) - References `profiles(id)`
- `member_role` (TEXT, NOT NULL) - `'parent'`, `'child'`, `'student'`, `'tutor'`
- `child_scope` (UUID[]) - Array of child IDs this member can access
  - For **parents**: Usually empty `{}` (means all children in family)
  - For **tutors**: Array of child IDs they can see
  - For **children/students**: Should contain their own child ID
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Current Status**: ✅ Exists

### 3. `children` Table
**Purpose**: Stores child records (the actual children in the family)

**Key Columns**:
- `id` (UUID, PRIMARY KEY)
- `family_id` (UUID, NOT NULL) - References `family(id)`
- `first_name`, `name` (TEXT) - Child's name
- `email` (TEXT, OPTIONAL) - Child's email (if they have their own account)
- `avatar_url` (TEXT)
- `archived` (BOOLEAN) - Soft delete flag

**Current Status**: ✅ Exists

## Critical Missing Link: User → Child Mapping

### The Problem

For a user with role `'child'` or `'student'`, we need to know **which child record** they correspond to. Currently, the architecture expects:

1. User logs in with email → `auth.users` table
2. User has a `profiles` entry → links to `family_id`
3. User has a `family_members` entry → specifies `member_role = 'child'` or `'student'`
4. **BUT**: How do we know which `children.id` this user represents?

### Current Solution (from `get_accessible_children` function)

The function currently expects:
- For child/student role: `child_scope` array should contain the child's ID
- Query: `c.id = ANY(fm.child_scope)` where `fm.member_role = 'child'`

**This means**: When creating a child account, you must:
1. Create the child record in `children` table
2. Create a user account (email/password)
3. Create `profiles` entry with `family_id`
4. Create `family_members` entry with:
   - `member_role = 'child'` or `'student'`
   - `child_scope = ARRAY[child_id]` ← **This links user to child**

## Recommended Database Schema Updates

### Option 1: Add `child_id` to `family_members` (Recommended)

Add a direct foreign key to make the relationship explicit:

```sql
ALTER TABLE family_members 
ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE CASCADE;

-- For child/student roles, this should be set
-- For parent/tutor roles, this should be NULL
```

**Benefits**:
- Explicit relationship
- Easier queries
- Clearer data model

### Option 2: Use `child_scope` Array (Current Approach)

Keep using `child_scope` array but ensure it's always populated correctly:

```sql
-- When creating child account:
INSERT INTO family_members (family_id, user_id, member_role, child_scope)
VALUES (
  family_id,
  user_id,
  'child',  -- or 'student'
  ARRAY[child_id]  -- Must contain the child's ID
);
```

**Benefits**:
- Already implemented
- Works with existing `get_accessible_children` function

## Data Flow for Child/Student Login

1. **User logs in** with email → `auth.users` table
2. **Get user profile**:
   ```sql
   SELECT * FROM profiles WHERE id = auth.uid()
   ```
   Returns: `family_id`, `role` (optional)

3. **Get family membership**:
   ```sql
   SELECT * FROM family_members 
   WHERE user_id = auth.uid() AND family_id = <family_id>
   ```
   Returns: `member_role`, `child_scope`

4. **If `member_role = 'child'` or `'student'`**:
   - Extract `child_id` from `child_scope[0]` (or use `child_id` if Option 1)
   - Query child record:
     ```sql
     SELECT * FROM children WHERE id = <child_id>
     ```

5. **Use `get_accessible_children` RPC**:
   ```sql
   SELECT * FROM get_accessible_children(auth.uid())
   ```
   Returns: `[{child_id, family_id}]` - Only the child's own record

## Required Database Setup Checklist

### ✅ Already Exists:
- [x] `profiles` table with `family_id` and `role` columns
- [x] `family_members` table with `member_role` and `child_scope`
- [x] `children` table with `family_id`
- [x] `get_accessible_children()` RPC function
- [x] RLS policies on `family_members`

### ⚠️ Needs Verification:
- [ ] When creating child accounts, `child_scope` is populated with child ID
- [ ] `get_accessible_children` function correctly handles child/student role
- [ ] RLS policies allow children to see their own data

### 🔧 Recommended Improvements:
- [ ] Add `child_id` column to `family_members` for explicit linking
- [ ] Add migration to populate `child_id` from `child_scope` for existing records
- [ ] Update `get_accessible_children` to use `child_id` if available

## Example: Creating a Child Account

```sql
-- 1. Child record already exists (created by parent)
-- child_id = '123e4567-e89b-12d3-a456-426614174000'
-- family_id = '987fcdeb-51a2-43d7-8f9e-0123456789ab'

-- 2. User signs up with email: child@example.com
-- auth.users.id = 'user-uuid-here'

-- 3. Create profile
INSERT INTO profiles (id, email, family_id, role)
VALUES ('user-uuid-here', 'child@example.com', '987fcdeb-51a2-43d7-8f9e-0123456789ab', 'child');

-- 4. Create family_members entry (CRITICAL!)
INSERT INTO family_members (family_id, user_id, member_role, child_scope)
VALUES (
  '987fcdeb-51a2-43d7-8f9e-0123456789ab',
  'user-uuid-here',
  'child',
  ARRAY['123e4567-e89b-12d3-a456-426614174000']  -- ← Links user to child
);
```

## Frontend Usage

The frontend should:

1. **On login**: Call `/api/me` endpoint
2. **Get response**:
   ```json
   {
     "id": "user-uuid",
     "email": "child@example.com",
     "role": "child",
     "family_id": "family-uuid",
     "accessible_children": [
       {
         "id": "child-uuid",
         "name": "Child Name"
       }
     ]
   }
   ```
3. **Use `accessible_children[0].id`** as the child ID for filtering
4. **Pass `userRole` and `accessibleChildren`** to components for role-based rendering

## Summary

**To make role-based access work, you need:**

1. ✅ `profiles` table - Links users to families
2. ✅ `family_members` table - Tracks roles and permissions
3. ✅ `children` table - Stores child records
4. ⚠️ **Ensure `family_members.child_scope` contains child ID for child/student accounts**
5. ✅ `get_accessible_children()` RPC - Returns accessible children based on role

**The critical link**: `family_members.child_scope` array must contain the child's ID when `member_role = 'child'` or `'student'`.
