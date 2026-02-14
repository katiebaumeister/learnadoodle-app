# Role-Based App Foundation - Implementation Status

## ✅ Completed Foundation (Phase 1)

### 1. Session Context (`contexts/SessionContext.js`)
**Single source of truth for role resolution**

- **Primary role source**: `family_members.member_role` (NOT NULL)
- **Fallback**: `profiles.role` (legacy mode, with dev warning)
- **Features**:
  - Loads role in context of active `family_id`
  - Calls `get_accessible_children()` RPC
  - Provides complete session object:
    - `family_id` - Active family
    - `member_role` - From family_members
    - `child_id` - If applicable (child/student)
    - `child_scope` - Array of accessible child IDs (tutor)
    - `accessible_children` - From RPC
    - `effective_role` - Resolved role (member_role or fallback)
    - `role_flags` - `{ isParent, isTutor, isChild }`
    - `legacyMode` - Boolean flag for dev warnings

**Usage:**
```javascript
import { useSession } from '../contexts/SessionContext';

function MyComponent() {
  const session = useSession();
  if (session.loading) return <Loading />;
  
  if (session.role_flags.isParent) {
    // Parent UI
  } else if (session.role_flags.isChild) {
    // Child UI
  }
}
```

### 2. Query Filtering Helpers (`lib/queryFilters.js`)
**Automatic query scoping based on role**

- `buildChildFilter(session)` - Returns filter mode:
  - `{ mode: 'ALL' }` - Parent (all children)
  - `{ mode: 'ONE', child_id }` - Child/student (only themselves)
  - `{ mode: 'MANY', child_ids[] }` - Tutor (assigned children)
  - `{ mode: 'NONE' }` - No access

- `applyChildFilter(query, session, childIdColumn)` - Applies filter to Supabase query
- `canAccessChild(session, childId)` - Permission check
- `getAccessibleChildIds(session)` - Get accessible child IDs array

**Usage:**
```javascript
import { applyChildFilter } from '../lib/queryFilters';

const query = supabase
  .from('events')
  .eq('family_id', session.family_id);
  
const filteredQuery = applyChildFilter(query, session, 'child_id');
const { data } = await filteredQuery.select('*');
```

### 3. Role-Based Navigation (`components/navigation/`)

#### RoleGate Component
- Blocks render until session loads
- Routes to appropriate navigator based on `role_flags`
- Shows loading/error states

#### ParentNavigator
- Full parent experience (existing WebLayout)
- All features visible
- All children accessible

#### ChildNavigator
- Simplified, action-oriented experience
- Uses WebLayout with `userRole="child"` prop
- Future: Custom simplified navigator

#### TutorNavigator
- "Assigned kids only" experience
- Uses WebLayout with `userRole="tutor"` prop
- Future: Custom tutor navigator

**Integration:**
- `WebRouter` wraps app with `SessionProvider`
- `RoleGate` chooses navigator based on role
- Each navigator passes session to `WebLayout`

## 🔄 Integration Points

### WebLayout Updates
- Accepts `session` and `userRole` props
- Updates `userRole` state from session when available
- Can use `session.role_flags` for conditional rendering

### LeftRail (Navigation Sidebar)
- Already has role-based filtering (lines 133-144)
- Filters tabs based on `userRole`:
  - Child: Only "Home"
  - Tutor: Home, Planner, Subjects, Library (no Records)
  - Parent: All tabs

## 📋 Next Steps (Phase 2)

### Priority 1: Apply Query Filters
- Update all event queries to use `applyChildFilter()`
- Update subject queries
- Update grades/attendance queries
- Update materials/library queries

### Priority 2: Child Features
1. **Submit Assignment** - One-tap photo/video upload
2. **Ask for Help** - Quick chips + note + photo
3. **Reflection Prompts** - After submission (emoji scale + text)

### Priority 3: Child Screens
1. **Child Home** - Today schedule, assignments, submit/help buttons
2. **Child Assignments** - Filtered list with one-tap submit

### Priority 4: Parent Review
1. **Review Inbox** - Submissions queue
2. **Approve/Reject** - Status state machine
3. **Rubric Grading** - Numeric + comment

### Priority 5: Tutor Features
1. **Students View** - List of assigned children
2. **Feedback** - Comments (no approval)

## 🧪 Testing Checklist

- [ ] Role resolution: family_members present → uses it
- [ ] Role resolution: family_members missing → falls back to profiles.role
- [ ] Access scoping: child sees only own child_id
- [ ] Access scoping: tutor sees only child_scope / RPC children
- [ ] Access scoping: parent sees all
- [ ] Navigation gating: each role lands in correct navigator
- [ ] Query filtering: events scoped correctly
- [ ] Query filtering: subjects scoped correctly
- [ ] Query filtering: materials scoped correctly

## 📝 Notes

- **No new tables** - Using existing schema
- **Backward compatible** - Falls back to profiles.role if family_members missing
- **Family-specific** - Role is always in context of family_id
- **RPC-based** - Uses `get_accessible_children()` for access control
