# Child Invite Flow - Complete Setup Guide

## Overview

When a parent invites a child, the system needs to:
1. Create an invite record with the child's ID
2. When child accepts, create their user account
3. Link the user account to the family
4. Link the user account to their child record

## Current Flow

### Step 1: Parent Creates Invite

**Endpoint**: `POST /api/child/create_invite`

**What happens**:
- Parent selects a child from their family
- System creates an invite record in `invites` table with:
  - `family_id` - The family ID
  - `child_id` - The child's ID (from `children` table)
  - `child_scope` - Array containing `[child_id]`
  - `role` - Set to `'child'`
  - `token` - Unique invite token
  - `email` - Placeholder email (will be updated when child accepts)

**Database State**:
```sql
INSERT INTO invites (
  family_id,
  child_id,
  child_scope,  -- [child_id]
  role,
  token,
  ...
) VALUES (...);
```

### Step 2: Child Accepts Invite

**Endpoint**: `POST /api/child/accept_invite`

**What happens**:
1. Child provides: email, password, username
2. System validates invite token
3. System creates Supabase auth user
4. System creates/updates `profiles` entry:
   - `id` = user_id
   - `email` = child's email
   - `family_id` = from invite
   - `role` = `'child'`
5. System creates `family_members` entry:
   - `family_id` = from invite
   - `user_id` = new user ID
   - `member_role` = `'child'`
   - `child_id` = from invite ✅
   - `child_scope` = **MISSING** ⚠️

## The Problem

The `accept_child_invite` function in `child_auth_routes.py` sets `child_id` but **doesn't set `child_scope`**. 

The `get_accessible_children()` function checks both:
- `child_id` column (if it exists)
- `child_scope` array (fallback)

**Current code** (line 251-256):
```python
member_res = supabase.table("family_members").insert({
    "family_id": family_id,
    "user_id": user_id,
    "member_role": "child",
    "child_id": child_id  # ✅ Set
    # child_scope is missing! ⚠️
}).execute()
```

## The Fix

Update `accept_child_invite` to also set `child_scope`:

```python
member_res = supabase.table("family_members").insert({
    "family_id": family_id,
    "user_id": user_id,
    "member_role": "child",
    "child_id": child_id,
    "child_scope": [child_id]  # ✅ Add this
}).execute()
```

## Complete Setup Checklist

### ✅ Already Working:
- [x] Invite creation stores `child_id` and `child_scope`
- [x] Profile creation with `family_id` and `role`
- [x] `family_members` entry creation with `child_id`

### ⚠️ Needs Fix:
- [ ] `family_members.child_scope` not set during invite acceptance
- [ ] Should set both `child_id` AND `child_scope` for consistency

### ✅ Database Ready:
- [x] `family_members` table has `child_id` column (from migration)
- [x] `family_members` table has `child_scope` column
- [x] `get_accessible_children()` function checks both

## Verification Query

After a child accepts an invite, verify the link:

```sql
-- Check if child is properly linked
SELECT 
  p.id as user_id,
  p.email,
  p.role,
  p.family_id,
  fm.member_role,
  fm.child_id,
  fm.child_scope,
  c.id as child_record_id,
  c.first_name
FROM profiles p
JOIN family_members fm ON fm.user_id = p.id
LEFT JOIN children c ON c.id = fm.child_id
WHERE p.role = 'child'
  AND fm.member_role = 'child';
```

**Expected Result**:
- `child_id` should match `child_record_id`
- `child_scope` should be `[child_id]`
- `family_id` should match in all tables

## Summary

**What needs to be done**:
1. Update `accept_child_invite` to set `child_scope = [child_id]` when creating `family_members` entry
2. This ensures both `child_id` and `child_scope` are set for consistency
3. The `get_accessible_children()` function will then work correctly

**The link chain**:
```
auth.users (email login)
  ↓
profiles (family_id, role='child')
  ↓
family_members (member_role='child', child_id=xxx, child_scope=[xxx])
  ↓
children (id=xxx, family_id=yyy)
```

All four pieces must be connected for role-based access to work!
