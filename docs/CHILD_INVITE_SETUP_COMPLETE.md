# Child Invite Setup - Complete Guide

## Summary

When a parent invites a child and the child accepts, the system needs to properly link:
1. User account (email login) → Family
2. User account → Child record
3. Set role and permissions correctly

## What Was Fixed

### 1. Backend: `accept_child_invite` Function ✅

**File**: `backend/routers/child_auth_routes.py`

**Fix**: Added `child_scope` array when creating `family_members` entry

**Before**:
```python
member_res = supabase.table("family_members").insert({
    "family_id": family_id,
    "user_id": user_id,
    "member_role": "child",
    "child_id": child_id  # Only child_id set
}).execute()
```

**After**:
```python
member_res = supabase.table("family_members").insert({
    "family_id": family_id,
    "user_id": user_id,
    "member_role": "child",
    "child_id": child_id,  # Explicit link
    "child_scope": [child_id]  # Array for get_accessible_children()
}).execute()
```

### 2. Database: `accept_invite` RPC Function ✅

**File**: `2025-11-19_phase6_chunk_b_tutor_aware_invites.sql`

**Fix**: Updated to:
- Extract `child_id` from invite if it exists
- Set both `child_id` and `child_scope` in `family_members`
- Handle cases where `child_scope` might be empty

## Complete Flow

### Step 1: Parent Creates Invite

**UI**: Parent clicks "+ Invite Child" in Family Members page

**Backend**: `POST /api/child/create_invite`
- Creates invite with `child_id` and `child_scope = [child_id]`
- Stores in `invites` table

**Database State**:
```sql
invites:
  - family_id: 'xxx'
  - child_id: 'yyy'  ← Links to children table
  - child_scope: ['yyy']  ← Array with child ID
  - role: 'child'
  - token: 'secure-token'
```

### Step 2: Child Accepts Invite

**UI**: Child visits `/child/invite/{token}` and provides:
- Email
- Password
- Username

**Backend**: `POST /api/child/accept_invite`
1. Validates invite token
2. Creates Supabase auth user
3. Creates `profiles` entry:
   ```sql
   profiles:
     - id: user_id
     - email: child@example.com
     - family_id: 'xxx'
     - role: 'child'
   ```
4. Creates `family_members` entry:
   ```sql
   family_members:
     - family_id: 'xxx'
     - user_id: user_id
     - member_role: 'child'
     - child_id: 'yyy'  ← Explicit link
     - child_scope: ['yyy']  ← Array for functions
   ```

### Step 3: Child Logs In

**Backend**: `GET /api/me`
- Calls `get_accessible_children(user_id)`
- Returns child's own record in `accessible_children` array

**Frontend**: Uses `accessible_children[0].id` to filter data

## Database Tables Involved

### 1. `invites` Table
- Stores invite tokens
- **Required columns**:
  - `family_id` - Links to family
  - `child_id` - Links to child record (for child invites)
  - `child_scope` - Array with child ID `[child_id]`
  - `role` - `'child'` for child invites
  - `token` - Unique invite token
  - `email` - Placeholder (updated on acceptance)

### 2. `profiles` Table
- Links user accounts to families
- **Required columns**:
  - `id` - User ID (from auth.users)
  - `email` - User's email
  - `family_id` - Links to family
  - `role` - `'child'` for child accounts

### 3. `family_members` Table
- Explicitly tracks family membership and roles
- **Required columns**:
  - `family_id` - Links to family
  - `user_id` - Links to profiles
  - `member_role` - `'child'` for child accounts
  - `child_id` - **Direct link to child record** (NEW)
  - `child_scope` - **Array with child ID** `[child_id]`

### 4. `children` Table
- Stores child records
- **Required columns**:
  - `id` - Child record ID
  - `family_id` - Links to family
  - `first_name`, `name` - Child's name

## Verification

After a child accepts an invite, verify the link:

```sql
-- Check complete link chain
SELECT 
  p.id as user_id,
  p.email,
  p.role as profile_role,
  p.family_id,
  fm.member_role,
  fm.child_id,
  fm.child_scope,
  c.id as child_record_id,
  c.first_name,
  CASE 
    WHEN fm.child_id = c.id THEN '✅ Linked correctly'
    ELSE '❌ Missing link'
  END as link_status
FROM profiles p
JOIN family_members fm ON fm.user_id = p.id
LEFT JOIN children c ON c.id = fm.child_id
WHERE p.role = 'child'
  AND fm.member_role = 'child';
```

**Expected Result**:
- `child_id` should match `child_record_id`
- `child_scope` should be `[child_id]`
- `link_status` should be "✅ Linked correctly"

## Testing Checklist

- [ ] Parent can create child invite
- [ ] Invite contains `child_id` and `child_scope`
- [ ] Child can accept invite with email/password
- [ ] `profiles` entry created with correct `family_id` and `role`
- [ ] `family_members` entry created with:
  - [ ] `member_role = 'child'`
  - [ ] `child_id` set correctly
  - [ ] `child_scope = [child_id]`
- [ ] Child can log in and see their own data
- [ ] `/api/me` returns child in `accessible_children`
- [ ] Subjects page filters to show only child's subjects

## Migration Order

1. Run `20260211_ensure_role_based_access_setup.sql` (adds `child_id` column)
2. Run `2025-11-19_phase6_chunk_b_tutor_aware_invites.sql` (updated with fixes)
3. Deploy updated `child_auth_routes.py` (includes `child_scope` fix)

## Summary

**The critical link**: When a child accepts an invite, the `family_members` entry must have:
- ✅ `child_id` - Direct foreign key to `children.id`
- ✅ `child_scope` - Array `[child_id]` for `get_accessible_children()` function

Both are now set correctly! 🎉
