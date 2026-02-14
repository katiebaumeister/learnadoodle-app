# Child/Tutor Setup - Remaining Work

## ✅ Completed

1. **Session Context** - Single source of truth for role resolution
2. **Query Filtering Helpers** - `buildChildFilter()` and `applyChildFilter()`
3. **Role-Based Navigation** - `RoleGate`, `ParentNavigator`, `ChildNavigator`, `TutorNavigator`
4. **Child Features** - `OneTapSubmitButton`, `AskForHelpModal`, `ReflectionPrompts`
5. **Some Query Filters Applied** - Events queries in `fetchTasks()` and `getExistingEvents()`

## 📋 Remaining Tasks

### Priority 1: Child Experience (Most Critical)

#### 1. Build Out ChildNavigator
**Current State**: Just passes through to `WebLayout` with `userRole="child"`

**Needed**:
- Create child-specific tab navigation (Home, Calendar, Subjects, Assignments, Ask for Help)
- Simplified UI - remove parent-only features
- Use existing components: `ChildDashboard`, `AssignmentsTab`, etc.

**Files to Create/Update**:
- `components/navigation/ChildNavigator.js` - Build out full navigator
- `components/child/ChildHomeScreen.js` - Today's schedule + assignments + quick actions
- `components/child/ChildAssignmentsScreen.js` - Full assignments list with filters

#### 2. Child Home Screen
**Requirements**:
- Today's schedule (only their events)
- "What's next" assignment card
- Big buttons: Submit / Ask for Help
- Status chips: Submitted / Needs revision / Approved
- Use existing `TodayScheduleCard` but filtered by child
- Use `OneTapSubmitButton` and `AskForHelpModal`

**Components to Use**:
- `components/home/TodayScheduleCard.js` (with session filter)
- `components/child/OneTapSubmitButton.js`
- `components/child/AskForHelpModal.js`
- `components/child/overview/AssignmentsCard.js` (already exists)

#### 3. Child Assignments Screen
**Requirements**:
- Filter: Due soon / Overdue / Submitted / Needs revision
- One-tap submit from list (use `OneTapSubmitButton`)
- Show status clearly
- Use existing `components/child/tabs/AssignmentsTab.js` as base

**Files to Update**:
- `components/child/tabs/AssignmentsTab.js` - Integrate `OneTapSubmitButton`

### Priority 2: Tutor Experience

#### 4. Build Out TutorNavigator
**Current State**: Just passes through to `WebLayout` with `userRole="tutor"`

**Needed**:
- Tab navigation: Calendar, Students, Assignments/Reviews, Subjects/Materials
- Show only assigned children (from `session.accessible_children`)
- Tutor-specific views

**Files to Create/Update**:
- `components/navigation/TutorNavigator.js` - Build out full navigator
- `components/tutor/TutorStudentsScreen.js` - List of assigned children
- `components/tutor/TutorAssignmentsScreen.js` - Assignments for assigned children

#### 5. Tutor Features
**Requirements**:
- View assigned children only
- Create assignments/events for assigned children
- Comment/feedback on submissions
- **Cannot** approve/reject (parent-only)
- Cannot access family settings/billing/invites

**Components to Create**:
- `components/tutor/TutorStudentsList.js` - List accessible children
- `components/tutor/TutorFeedbackModal.js` - Feedback (no approval)

### Priority 3: Parent Review Inbox

#### 6. Parent Review Inbox Screen
**Requirements**:
- Queue of submissions needing review
- Help requests
- Revision resubmits
- Actions: Approve / Needs revision / Reject
- Comment + rubric

**Files to Create**:
- `components/parent/ReviewInboxScreen.js`
- `components/parent/ReviewSubmissionCard.js`
- `components/parent/ApproveRejectModal.js`

### Priority 4: Query Filtering (Data Access)

#### 7. Apply Filters to Subjects Queries
**Files to Update**:
- `components/subjects/SubjectsPage.js` - Already has some filtering, verify it uses session
- `lib/services/subjectsClient.js` - Apply filters to all subject queries
- Any other subject-related queries

#### 8. Apply Filters to Materials/Library Queries
**Files to Update**:
- `components/materials/MaterialsPage.js` - Apply session filters
- `lib/services/materialsClient.js` - Apply filters to material queries
- Any other material-related queries

#### 9. Apply Filters to Remaining Event Queries
**Files to Update**:
- `components/WebContent.js` - Multiple event queries (lines 829, 1191, 1930, etc.)
- `components/planner/BacklogDrawer.js` - Backlog loading
- `components/EventSearch.js` - Search queries
- `components/FamilyCalendarView.js` - Calendar data

## 🎯 Recommended Order

1. **Child Home Screen** - Most visible, uses existing components
2. **Child Assignments Screen** - Integrate `OneTapSubmitButton`
3. **Build Out ChildNavigator** - Wire everything together
4. **Tutor Students View** - Simple list of assigned children
5. **Parent Review Inbox** - Critical for workflow
6. **Query Filtering** - Apply incrementally as needed

## 📝 Notes

- Existing components can be reused: `ChildDashboard`, `AssignmentsTab`, `AssignmentsCard`
- Session context is already available via `useSession()` hook
- Query filters are ready to use via `applyChildFilter()`
- All child features (submit, help, reflection) are complete and ready to integrate
