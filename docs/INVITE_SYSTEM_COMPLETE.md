# Complete Invite System - All Roles

## ✅ Yes, Parent and Tutor Invites Work!

The invite system is fully set up for all three role types. Here's how each works:

## Quick Summary

| Role | Invite Creation | Acceptance | `family_members` Setup | Access Level |
|------|----------------|------------|------------------------|--------------|
| **Parent** | `POST /api/invite/create` | `POST /api/invite/accept` | `member_role='parent'`, `child_scope=[]`, `child_id=NULL` | All children in family |
| **Tutor** | `POST /api/family/invite` | `POST /api/invite/accept` | `member_role='tutor'`, `child_scope=[selected]`, `child_id=NULL` | Only children in `child_scope` |
| **Child** | `POST /api/child/create_invite` | `POST /api/child/accept_invite` | `member_role='child'`, `child_scope=[child_id]`, `child_id=child_id` | Only themselves |

## Invite expiration

Invite links expire in 30 days. If a link has expired, the recipient should ask the person who invited them to send a new invite. The app and invite landing/accept pages show this note to users when an invite is invalid or expired.

## Parent Invites

### How It Works

1. **Parent A invites Parent B**:
   - Parent A clicks "+ Invite Parent"
   - System creates invite with `role='parent'`, `child_scope=[]`

2. **Parent B accepts**:
   - Parent B logs in (must have account)
   - Clicks accept on invite
   - `accept_invite` RPC creates:
     - `profiles.role = 'parent'`
     - `profiles.family_id = family_id`
     - `family_members.member_role = 'parent'`
     - `family_members.child_scope = []` (empty = sees all)
     - `family_members.child_id = NULL`

3. **Result**:
   - Parent B can see all children in the family
   - `get_accessible_children()` returns all family children
   - Full access to all family data

### Database State After Acceptance

```sql
profiles:
  id: parent_b_user_id
  email: parent_b@example.com
  family_id: family_123
  role: 'parent'

family_members:
  family_id: family_123
  user_id: parent_b_user_id
  member_role: 'parent'
  child_scope: []  ← Empty = sees all children
  child_id: NULL   ← Not applicable
```

## Tutor Invites

### How It Works

1. **Parent invites Tutor**:
   - Parent clicks "+ Invite Tutor"
   - Selects which children tutor can see (e.g., "Enzo" and "Max")
   - System creates invite with:
     - `role='tutor'`
     - `child_scope=['enzo_id', 'max_id']`

2. **Tutor accepts**:
   - Tutor logs in (must have account)
   - Clicks accept on invite
   - `accept_invite` RPC creates:
     - `profiles.role = 'tutor'`
     - `profiles.family_id = family_id`
     - `family_members.member_role = 'tutor'`
     - `family_members.child_scope = ['enzo_id', 'max_id']`
     - `family_members.child_id = NULL`

3. **Result**:
   - Tutor can only see Enzo and Max
   - `get_accessible_children()` returns only Enzo and Max
   - Limited access based on `child_scope`

### Database State After Acceptance

```sql
profiles:
  id: tutor_user_id
  email: tutor@example.com
  family_id: family_123
  role: 'tutor'

family_members:
  family_id: family_123
  user_id: tutor_user_id
  member_role: 'tutor'
  child_scope: ['enzo_id', 'max_id']  ← Selected children
  child_id: NULL  ← Not applicable
```

## Child Invites

### How It Works

1. **Parent invites Child**:
   - Parent clicks "+ Invite Child"
   - Selects a child (e.g., "Lilly")
   - System creates invite with:
     - `role='child'`
     - `child_id='lilly_id'`
     - `child_scope=['lilly_id']`

2. **Child accepts**:
   - **Option A**: New account (via `/api/child/accept_invite`)
     - Creates new auth user
     - Creates `profiles` and `family_members` entries
   - **Option B**: Existing user (via `/api/invite/accept`)
     - Updates existing `profiles`
     - Creates `family_members` entry

3. **Result**:
   - Child can only see their own data
   - `get_accessible_children()` returns only Lilly
   - Filtered access based on `child_id`

### Database State After Acceptance

```sql
profiles:
  id: child_user_id
  email: child@example.com
  family_id: family_123
  role: 'child'

family_members:
  family_id: family_123
  user_id: child_user_id
  member_role: 'child'
  child_scope: ['lilly_id']  ← Array with child ID
  child_id: 'lilly_id'  ← Direct link to child record
```

## The `accept_invite` RPC Function

This single function handles all three roles correctly:

```sql
CREATE OR REPLACE FUNCTION accept_invite(p_token text, p_user_id uuid)
RETURNS jsonb
AS $$
  -- 1. Find invite by token
  -- 2. Update profiles with role and family_id
  -- 3. Create/update family_members entry:
  --    - For parent: child_scope=[], child_id=NULL
  --    - For tutor: child_scope=[selected_children], child_id=NULL
  --    - For child: child_scope=[child_id], child_id=child_id
  -- 4. Mark invite as accepted
END;
$$;
```

## Verification Queries

### Check All Invite Types

```sql
-- Verify all family members are properly set up
SELECT 
  p.email,
  p.role as profile_role,
  fm.member_role,
  fm.child_scope,
  fm.child_id,
  CASE 
    WHEN fm.member_role = 'parent' AND fm.child_scope = '{}' THEN '✅ Parent (sees all)'
    WHEN fm.member_role = 'tutor' AND array_length(fm.child_scope, 1) > 0 THEN '✅ Tutor (limited scope)'
    WHEN fm.member_role IN ('child', 'student') AND fm.child_id IS NOT NULL THEN '✅ Child (self only)'
    ELSE '❌ Check setup'
  END as status
FROM profiles p
JOIN family_members fm ON fm.user_id = p.id
WHERE p.family_id = 'YOUR_FAMILY_ID'
ORDER BY fm.member_role, p.email;
```

## Frontend Usage

All three roles use the same pattern:

1. **On login**: Call `/api/me`
2. **Get response**:
   ```json
   {
     "role": "parent|tutor|child",
     "accessible_children": [
       {"id": "child_id", "name": "Child Name"}
     ]
   }
   ```
3. **Use `accessible_children`**:
   - **Parent**: Array contains all children → show all data
   - **Tutor**: Array contains selected children → filter to those children
   - **Child**: Array contains one child → filter to that child only

## Summary

✅ **Parent invites**: Work correctly - parents see all children  
✅ **Tutor invites**: Work correctly - tutors see only selected children  
✅ **Child invites**: Work correctly - children see only themselves  

All three use the same `accept_invite` RPC function, which properly sets up `family_members` entries with the correct `child_scope` and `child_id` values.

The system is complete and ready to use! 🎉
