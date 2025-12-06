# Multi-Family Collaboration Implementation Guide

## Overview
Enable co-ops, pods, shared classes, shared templates, and shared evidence across multiple families. Scales Learnadoodle beyond individual families.

## Database Schema

### 1. Groups/Co-ops table
```sql
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  group_type text NOT NULL CHECK (group_type IN ('coop', 'pod', 'class', 'club')),
  
  -- Ownership
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  
  -- Settings
  is_public boolean DEFAULT false,
  requires_approval boolean DEFAULT true,
  max_members integer, -- NULL = unlimited
  
  -- Metadata
  tags text[] DEFAULT '{}',
  location text,
  meeting_schedule jsonb, -- Recurring meeting times
  cover_image_url text,
  
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS groups_type_idx ON groups(group_type);
CREATE INDEX IF NOT EXISTS groups_public_idx ON groups(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS groups_tags_idx ON groups USING GIN(tags);

-- RLS policies
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public groups"
ON groups FOR SELECT
TO authenticated
USING (is_public = true OR is_group_member(id));

CREATE POLICY "Group members can view private groups"
ON groups FOR SELECT
TO authenticated
USING (is_group_member(id));

CREATE POLICY "Users can create groups"
ON groups FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update groups"
ON groups FOR UPDATE
TO authenticated
USING (is_group_admin(id))
WITH CHECK (is_group_admin(id));
```

### 2. Group members table
```sql
CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  role text DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  joined_at timestamptz DEFAULT now(),
  invited_by uuid REFERENCES profiles(id),
  UNIQUE(group_id, family_id) -- One family per group
);

CREATE INDEX IF NOT EXISTS group_members_group_idx ON group_members(group_id);
CREATE INDEX IF NOT EXISTS group_members_family_idx ON group_members(family_id);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members(user_id);

-- RLS policies
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view members"
ON group_members FOR SELECT
TO authenticated
USING (is_group_member(group_id));

CREATE POLICY "Group admins can manage members"
ON group_members FOR ALL
TO authenticated
USING (is_group_admin(group_id))
WITH CHECK (is_group_admin(group_id));
```

### 3. Shared templates table
```sql
CREATE TABLE IF NOT EXISTS shared_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL REFERENCES profiles(id),
  shared_at timestamptz DEFAULT now() NOT NULL,
  notes text, -- Why this template was shared
  UNIQUE(template_id, group_id)
);

CREATE INDEX IF NOT EXISTS shared_templates_group_idx ON shared_templates(group_id);
CREATE INDEX IF NOT EXISTS shared_templates_template_idx ON shared_templates(template_id);
```

### 4. Shared evidence table
```sql
CREATE TABLE IF NOT EXISTS shared_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES uploads(id) ON DELETE CASCADE,
  event_outcome_id uuid REFERENCES event_outcomes(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL REFERENCES profiles(id),
  shared_at timestamptz DEFAULT now() NOT NULL,
  visibility text DEFAULT 'group' CHECK (visibility IN ('group', 'public')),
  description text,
  UNIQUE(upload_id, group_id),
  UNIQUE(event_outcome_id, group_id),
  CHECK (
    (upload_id IS NOT NULL AND event_outcome_id IS NULL) OR
    (upload_id IS NULL AND event_outcome_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS shared_evidence_group_idx ON shared_evidence(group_id);
CREATE INDEX IF NOT EXISTS shared_evidence_upload_idx ON shared_evidence(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shared_evidence_outcome_idx ON shared_evidence(event_outcome_id) WHERE event_outcome_id IS NOT NULL;
```

### 5. Shared classes/events table
```sql
CREATE TABLE IF NOT EXISTS shared_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  event_template_id uuid, -- Template for recurring shared events
  title text NOT NULL,
  description text,
  subject_id uuid REFERENCES subject(id),
  start_ts timestamptz NOT NULL,
  end_ts timestamptz NOT NULL,
  recurrence_rule text, -- iCal RRULE format
  location text,
  max_participants integer,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS shared_events_group_idx ON shared_events(group_id);
CREATE INDEX IF NOT EXISTS shared_events_start_idx ON shared_events(start_ts);

-- Link shared events to individual family events
CREATE TABLE IF NOT EXISTS shared_event_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_event_id uuid NOT NULL REFERENCES shared_events(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id),
  status text DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'absent')),
  UNIQUE(shared_event_id, event_id)
);

CREATE INDEX IF NOT EXISTS shared_event_instances_shared_idx ON shared_event_instances(shared_event_id);
CREATE INDEX IF NOT EXISTS shared_event_instances_event_idx ON shared_event_instances(event_id);
```

### 6. Helper functions
```sql
-- Check if user is member of group
CREATE OR REPLACE FUNCTION is_group_member(_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    WHERE gm.group_id = _group_id
      AND gm.family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT family_id FROM family_members WHERE user_id = auth.uid()
      )
      AND gm.status = 'approved'
  );
$$;

-- Check if user is admin of group
CREATE OR REPLACE FUNCTION is_group_admin(_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    WHERE gm.group_id = _group_id
      AND gm.role = 'admin'
      AND gm.family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT family_id FROM family_members WHERE user_id = auth.uid()
      )
      AND gm.status = 'approved'
  );
$$;
```

## Backend API Endpoints

### Groups Routes (`backend/routers/groups_routes.py`)

```python
@router.post("/groups")
async def create_group(
    group: GroupIn,
    user: dict = Depends(get_current_user),
):
    """Create a new group (co-op, pod, class)"""

@router.get("/groups")
async def list_groups(
    group_type: Optional[str] = None,
    is_public: Optional[bool] = None,
    q: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List groups (public or user's groups)"""

@router.get("/groups/{group_id}")
async def get_group_details(
    group_id: str,
    user: dict = Depends(get_current_user),
):
    """Get group details including members"""

@router.post("/groups/{group_id}/join")
async def join_group(
    group_id: str,
    user: dict = Depends(get_current_user),
):
    """Request to join a group"""

@router.post("/groups/{group_id}/invite")
async def invite_to_group(
    group_id: str,
    family_id: str,
    user: dict = Depends(get_current_user),
):
    """Invite a family to join group"""

@router.post("/groups/{group_id}/templates/{template_id}/share")
async def share_template(
    group_id: str,
    template_id: str,
    notes: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Share a template with group"""

@router.post("/groups/{group_id}/evidence/share")
async def share_evidence(
    group_id: str,
    upload_id: Optional[str] = None,
    event_outcome_id: Optional[str] = None,
    description: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Share evidence (upload or outcome) with group"""

@router.post("/groups/{group_id}/events")
async def create_shared_event(
    group_id: str,
    event: SharedEventIn,
    user: dict = Depends(get_current_user),
):
    """Create a shared class/event for the group"""

@router.post("/groups/{group_id}/events/{event_id}/register")
async def register_for_event(
    group_id: str,
    event_id: str,
    child_id: str,
    user: dict = Depends(get_current_user),
):
    """Register a child for a shared event"""
```

## Frontend Components

### 1. Groups Browser (`components/groups/GroupsBrowser.js`)

```jsx
// Browse and discover groups
// Features:
// - Search groups
// - Filter by type (co-op, pod, class)
// - Public groups list
// - My groups list
// - Create group button
```

### 2. Group Details Page (`components/groups/GroupDetailsPage.js`)

```jsx
// Group details and management
// Sections:
// - Header (name, description, cover image)
// - Members list
// - Shared templates
// - Shared evidence gallery
// - Shared events calendar
// - Settings (if admin)
```

### 3. Create Group Modal (`components/groups/CreateGroupModal.js`)

```jsx
// Create a new group
// Fields:
// - Name
// - Description
// - Type (co-op, pod, class, club)
// - Public/Private
// - Requires approval toggle
// - Max members
// - Tags
// - Cover image upload
```

### 4. Shared Templates Gallery (`components/groups/SharedTemplatesGallery.js`)

```jsx
// View templates shared by group members
// Features:
// - Grid of template cards
// - Filter by subject/grade
// - "Apply to My Family" button
// - "Share My Template" button
```

### 5. Shared Evidence Gallery (`components/groups/SharedEvidenceGallery.js`)

```jsx
// View evidence shared by group members
// Features:
// - Grid of uploads/outcomes
// - Filter by subject/child
// - View details modal
// - "Share My Evidence" button
```

### 6. Shared Events Calendar (`components/groups/SharedEventsCalendar.js`)

```jsx
// View and register for shared events
// Features:
// - Calendar view
// - Event details
// - Registration button
// - "Create Shared Event" button
// - Attendance tracking
```

## User Flows

### Flow 1: Create & Join Co-op
1. User clicks "Groups" → "Create Group"
2. Fills out group details:
   - Name: "Math Co-op 2025"
   - Type: Co-op
   - Description
   - Public/Private
3. Creates group
4. Invites families via email/link
5. Families receive invite → Click "Join"
6. Admin approves → Family becomes member

### Flow 2: Share Template with Group
1. User has a template they love
2. Navigates to group page
3. Clicks "Share Template"
4. Selects template from list
5. Adds notes: "Great for Algebra 1"
6. Shares → Template appears in group's shared templates
7. Other members can apply it to their families

### Flow 3: Share Evidence with Group
1. Child completes amazing project
2. Parent uploads to portfolio
3. Clicks "Share with Group"
4. Selects group(s)
5. Adds description
6. Evidence appears in group gallery
7. Other parents can view and get ideas

### Flow 4: Create Shared Class
1. Tutor creates shared event:
   - Title: "Weekly Science Lab"
   - Recurring: Every Tuesday 2-3pm
   - Location: Community Center
   - Max: 10 students
2. Event appears in group calendar
3. Parents register their children
4. Event automatically creates instances in each family's calendar
5. Tutor tracks attendance across all families

## Visual Design

### Groups Browser
```
┌─────────────────────────────────────────┐
│ 🔍 Search Groups...                     │
├─────────────────────────────────────────┤
│ [All] [Co-ops] [Pods] [Classes] [Clubs]│
├─────────────────────────────────────────┤
│ Public Groups                           │
│ ┌─────────────────────────────────────┐│
│ │ Math Co-op 2025                     ││
│ │ 👥 8 families • 📚 12 templates    ││
│ │ [View] [Join]                      ││
│ └─────────────────────────────────────┘│
│                                         │
│ My Groups                               │
│ ┌─────────────────────────────────────┐│
│ │ Science Pod                        ││
│ │ 👥 4 families • 📅 2 events        ││
│ │ [View]                             ││
│ └─────────────────────────────────────┘│
│                                         │
│ [+ Create Group]                        │
└─────────────────────────────────────────┘
```

### Group Details Page
```
┌─────────────────────────────────────────┐
│ [Cover Image]                           │
│ Math Co-op 2025                         │
│ 👥 8 families • 📚 12 templates        │
├─────────────────────────────────────────┤
│ [Members] [Templates] [Evidence] [Events]│
├─────────────────────────────────────────┤
│ Members (8)                             │
│ ┌─────────────────────────────────────┐│
│ │ 👤 Sarah's Family (Admin)          ││
│ │ 👤 Mike's Family                   ││
│ │ 👤 Emma's Family                   ││
│ └─────────────────────────────────────┘│
│                                         │
│ Shared Templates (12)                   │
│ ┌─────┐ ┌─────┐ ┌─────┐              │
│ │ 📚  │ │ 📚  │ │ 📚  │              │
│ └─────┘ └─────┘ └─────┘              │
└─────────────────────────────────────────┘
```

## Implementation Steps

1. **Database**
   - Create `groups` table
   - Create `group_members` table
   - Create `shared_templates` table
   - Create `shared_evidence` table
   - Create `shared_events` table
   - Create helper functions

2. **Backend API**
   - Create `groups_routes.py`
   - Add CRUD endpoints for groups
   - Add member management endpoints
   - Add sharing endpoints
   - Add event management endpoints

3. **Frontend Components**
   - Create Groups browser
   - Create Group details page
   - Create sharing modals
   - Create shared galleries
   - Create shared events calendar

4. **Integration**
   - Add "Groups" tab to navigation
   - Add "Share" buttons to templates/evidence
   - Add group context to relevant pages
   - Add notifications for group activity

## Benefits

✅ **Scales Beyond Families** - Supports co-ops, pods, classes
✅ **Network Effects** - More value as more families join
✅ **Resource Sharing** - Templates and evidence shared easily
✅ **Collaborative Learning** - Shared classes and events
✅ **Community Building** - Creates engaged learning communities

