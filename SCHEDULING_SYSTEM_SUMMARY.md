# Scheduling System Summary

## Overview

The scheduling system is a multi-layered architecture that combines recurring rules, one-time overrides, cached availability, and AI-powered optimization to intelligently schedule learning activities.

## 1. Scheduling Rules

### What Are Scheduling Rules?

Recurring patterns that define when teaching/learning happens. Rules can be set at the **family level** (applies to all children) or **child level** (specific to one child).

### Rule Types

- **`availability_teach`** - Available for teaching/learning
- **`availability_off`** - Not available (off day)
- **`activity_default`** - Default activity settings

### Rule Structure

Rules are stored in the `schedule_rules` table with:
- **Scope**: `family` or `child`
- **Recurrence**: RFC5545 format (e.g., weekly Mon-Fri)
- **Time windows**: `start_time` and `end_time`
- **Date range**: `start_date` to `end_date`
- **Priority**: Higher priority rules override lower priority ones

### Example Rule

```json
{
  "scope_type": "child",
  "scope_id": "max-child-uuid",
  "rule_type": "availability_teach",
  "title": "Max's School Days",
  "start_date": "2025-09-01",
  "end_date": "2026-06-30",
  "start_time": "09:00",
  "end_time": "15:00",
  "rrule": {
    "freq": "WEEKLY",
    "byweekday": ["MO", "TU", "WE", "TH", "FR"]
  },
  "priority": 100
}
```

### Specificity Cascade Setting

The system supports two modes for handling overlapping rules:

1. **Add-Remove Math** (default): Rules combine additively
2. **Specificity Cascade**: Child rules override family rules

This is controlled by the `specificity_cascade` setting in `family_settings`.

### UI Location

**Component**: `ScheduleRulesView` (`components/ScheduleRulesView.js`)
- Accessible via Settings → Schedule Rules or Planner → Schedule Rules
- Three tabs: Weekly Rules, Overrides, Preview
- Visual heatmap preview for next 14 days
- Scope switcher (Family vs individual children)

## 2. Schedule Overrides

### What Are Overrides?

One-time exceptions to recurring rules for specific dates. Overrides **always win** over rules for that specific date.

### Override Types

- **`day_off`** - Completely off (e.g., sick day, vacation)
- **`late_start`** - Start later than usual
- **`early_end`** - End earlier than usual
- **`extra_block`** - Add extra teaching time
- **`cancel_block`** - Cancel a specific time slot

### Override Structure

Stored in `schedule_overrides` table:
- **Scope**: `family` or `child`
- **Date**: Specific date (YYYY-MM-DD)
- **Override kind**: Type of override
- **Time adjustments**: `start_time`, `end_time` as needed

### Example Override

```json
{
  "scope_type": "child",
  "scope_id": "max-child-uuid",
  "date": "2025-10-20",
  "override_kind": "late_start",
  "start_time": "11:00",
  "notes": "Doctor appointment in morning"
}
```

**Result**: Normal rule says 9am-3pm, but override makes it 11am-3pm on Oct 20.

## 3. Blackout Periods

### What Are Blackout Periods?

Planned absences or unavailable periods (trips, testing weeks, etc.) that automatically create schedule overrides and prevent scheduling during those dates.

### Blackout Features

- **Family-wide or child-specific**: Can apply to all children or just one
- **Date range**: Start and end dates (inclusive)
- **Reason**: Optional description (e.g., "Family trip", "Testing week")
- **Automatic override creation**: Creates `day_off` overrides for each day in range
- **Cache refresh**: Automatically refreshes `calendar_days_cache` when created

### Blackout Structure

Stored in `blackout_periods` table:
- `family_id`: Required
- `child_id`: Optional (null = family-wide)
- `starts_on`: Start date (YYYY-MM-DD)
- `ends_on`: End date (YYYY-MM-DD)
- `reason`: Optional description

### How Blackouts Work

1. User creates blackout via UI (`BlackoutPanel` component)
2. System inserts record into `blackout_periods`
3. System creates `schedule_overrides` with `day_off` for each day
4. System refreshes `calendar_days_cache` for affected date range
5. AI scheduler respects blackouts when finding available slots

### UI Location

**Component**: `BlackoutPanel` (`components/planner/BlackoutPanel.js`)
- Accessible via Settings → Blackouts or Planner → Blackouts
- Form to create new blackouts (select child, dates, reason)
- List of existing blackouts with delete option

### API Route

**POST `/api/ai/blackout`**
- Creates blackout period
- Automatically creates schedule overrides
- Refreshes calendar cache
- Parameters: `familyId`, `childId?`, `startsOn`, `endsOn`, `reason?`

## 4. Calendar Days Cache

### What Is the Cache?

Pre-computed daily availability stored in `calendar_days_cache` for fast lookups. The cache combines rules and overrides to produce the final availability per day.

### Cache Structure

```sql
calendar_days_cache (
  id UUID,
  family_id UUID,
  child_id UUID,
  date DATE,
  day_status TEXT,        -- 'teach', 'off', 'partial'
  teach_minutes INTEGER, -- Total available minutes
  start_time TIME,
  end_time TIME,
  source_rule_id UUID,
  computed_at TIMESTAMPTZ
)
```

### Cache Updates

Cache updates automatically via database triggers:
- When rules are added/changed/deleted
- When overrides are added/changed/deleted
- When blackouts are created

Manual refresh available via RPC: `refresh_calendar_days_cache(p_family_id, p_from_date, p_to_date)`

### Why Cache Exists

- Rules + overrides are complex to calculate in real-time
- Cache stores final result per day
- Makes availability lookups instant
- Used by AI scheduler to find open slots

## 5. AI Scheduling & Optimization Tools

### Available AI Tools

#### 1. **Rebalance Schedule**
- **Purpose**: Analyzes schedule and suggests optimizations to balance workload across time
- **Route**: `POST /api/ai/propose-reschedule` with `reason: 'rebalance'`
- **UI**: ToolContent → Rebalance Schedule
- **How it works**: 
  - Calculates deficits (required vs done minutes per subject)
  - Finds free gaps using calendar cache
  - Packs events using greedy algorithm
  - Respects constraints (max 240 min/day, block sizes 30-90 min)

#### 2. **Pack This Week**
- **Purpose**: Efficiently packs tasks into available time slots
- **Route**: `POST /api/ai/propose-reschedule` with `reason: 'pack_week'`
- **UI**: ToolContent → Pack This Week (opens `PackWeekModal`)
- **How it works**:
  - Includes flexible backlog items
  - Finds optimal slots for unscheduled tasks
  - Balances subjects across the week

#### 3. **What-If Analysis**
- **Purpose**: Simulates different scheduling scenarios
- **Route**: `POST /api/ai/propose-reschedule` with `reason: 'what_if'`
- **UI**: ToolContent → What-if Analysis
- **How it works**:
  - Explores alternative scheduling options
  - Shows impact of changes without applying them
  - Useful for planning ahead

#### 4. **Schedule Setup**
- **Purpose**: AI-powered curriculum scheduling for entire year
- **UI**: Schedule setup / Planning Preferences
- **How it works**: Uses LLM to generate year-long curriculum plan

#### 5. **Catch Up**
- **Purpose**: Helps catch up on missed work and reschedule tasks
- **UI**: AI Tools → Catch Up
- **How it works**: Identifies missed work and suggests rescheduling

#### 6. **Summarize Progress**
- **Purpose**: AI-generated summary of learning progress
- **UI**: AI Tools → Summarize Progress
- **How it works**: Analyzes completed work and generates summary

#### 7. **Analytics**
- **Purpose**: Detailed analytics and insights about learning schedule
- **UI**: AI Tools → Analytics
- **How it works**: Provides data-driven insights

#### 8. **Heatmap**
- **Purpose**: Visual curriculum heatmap showing coverage over time
- **UI**: AI Tools → Heatmap or ToolContent → Curriculum Heatmap
- **Component**: `CurriculumHeatmap`
- **How it works**: Shows subject coverage across date range

## 6. Scheduling & Optimization System Architecture

### Data Flow

```
┌─────────────────────┐
│  Schedule Rules     │ ← Recurring patterns (Mon-Fri 9am-3pm)
│  (recurring)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Schedule Overrides  │ ← One-time exceptions (Oct 20: late start)
│ (one-time changes)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Blackout Periods   │ ← Planned absences (Nov 1-5: trip)
│  (unavailable days)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Calendar Days Cache │ ← Pre-computed availability
│ (computed result)   │   "Oct 18: teach 9am-3pm"
│                     │   "Oct 20: teach 11am-3pm" (late start)
│                     │   "Nov 1: off" (blackout)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   AI Scheduler      │ ← Finds open slots, packs events
│   (propose-reschedule)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   AI Plans          │ ← Proposal store (draft/applied)
│   (ai_plans)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Events         │ ← Actual scheduled lessons/activities
│  (what shows up)    │
└─────────────────────┘
```

### Key Database Tables

1. **`schedule_rules`** - Recurring availability patterns
2. **`schedule_overrides`** - One-time exceptions
3. **`blackout_periods`** - Planned absences
4. **`calendar_days_cache`** - Pre-computed availability
5. **`learning_velocity`** - Adaptive learning speed per child/subject (0.6-1.5 range)
6. **`ai_plans`** - Proposal store (status: draft/applied/discarded/partial)
7. **`ai_plan_changes`** - Individual changes in proposals (add/move/delete)
8. **`events`** - Actual scheduled items
9. **`syllabi`** - Curriculum syllabi
10. **`subject_goals`** - Learning goals per subject

### Key Database Functions (RPCs)

1. **`get_child_availability(child_id, from_date, to_date)`**
   - Returns daily availability from cache
   - Includes available time blocks

2. **`refresh_calendar_days_cache(p_family_id, p_from_date, p_to_date)`**
   - Recomputes cache for date range
   - Processes rules, applies overrides, resolves conflicts

3. **`get_required_minutes(p_family_id, p_child_id, p_week_start, p_weeks_ahead)`**
   - Returns velocity-adjusted weekly minutes per subject
   - Considers learning velocity multipliers

4. **`done_minutes_for_week(p_family_id, p_child_id, p_subject_id, p_week_start)`**
   - Calculates completed minutes for a week

5. **`scheduled_minutes_for_week(p_family_id, p_child_id, p_subject_id, p_week_start)`**
   - Calculates scheduled minutes for a week

6. **`get_flexible_backlog(p_family_id)`**
   - Returns unscheduled flexible tasks

7. **`set_specificity_cascade(p_family, p_value)`**
   - Updates specificity cascade setting

## 7. API Routes

### AI Rescheduling Routes (`lib/aiReschedulingRoutes.js`)

#### POST `/api/ai/blackout`
Creates a blackout period.

**Request Body**:
```json
{
  "familyId": "uuid",
  "childId": "uuid" | null,
  "startsOn": "2025-11-01",
  "endsOn": "2025-11-05",
  "reason": "Family trip"
}
```

**Response**:
```json
{
  "blackoutId": "uuid",
  "overridesCreated": 5,
  "dates": ["2025-11-01", "2025-11-02", ...]
}
```

**What it does**:
1. Inserts into `blackout_periods`
2. Creates `schedule_overrides` with `day_off` for each day
3. Refreshes `calendar_days_cache`

#### POST `/api/ai/propose-reschedule`
Generates AI plan proposal (does NOT apply changes).

**Request Body**:
```json
{
  "familyId": "uuid",
  "weekStart": "2025-11-03",
  "childIds": ["uuid1", "uuid2"],
  "horizonWeeks": 2,
  "reason": "rebalance" | "pack_week" | "what_if"
}
```

**Response**:
```json
{
  "planId": "uuid",
  "suggestions": [
    {
      "id": "uuid",
      "title": "Math - Chapter 5",
      "proposedStart": "2025-11-06T09:00:00Z",
      "proposedEnd": "2025-11-06T10:00:00Z",
      "notes": "AI rebalanced schedule",
      "childId": "uuid"
    }
  ],
  "metadata": {
    "totalEvents": 5,
    "totalMinutes": 300
  }
}
```

**What it does**:
1. Loads rules, overrides, events, syllabi, velocities, blackouts, backlog
2. Calculates deficits per subject/child (required - done minutes)
3. Computes free gaps using `calendar_days_cache` and existing events
4. Packs events using greedy algorithm:
   - Sorts needs by priority (hard-due > largest deficit > standard weekly)
   - Respects constraints (max 240 min/day, block sizes 30-90 min)
   - Avoids blackout days
5. Creates `ai_plans` record (status: draft)
6. Creates `ai_plan_changes` records (change_type: add)

#### PATCH `/api/ai/approve`
Applies approved changes atomically.

**Request Body**:
```json
{
  "planId": "uuid",
  "approvals": [
    {
      "changeId": "uuid",
      "approved": true,
      "edits": {
        "startTs": "2025-11-06T10:00:00Z",
        "endTs": "2025-11-06T11:00:00Z"
      }
    }
  ]
}
```

**Response**:
```json
{
  "applied": 3,
  "skipped": 1,
  "errors": 0,
  "results": [...]
}
```

**What it does**:
1. Gets plan and all changes
2. For each approved change:
   - **add**: Inserts into `events` table
   - **move**: Updates `events` table
   - **delete**: Deletes from `events` table
3. Marks changes as applied
4. Updates plan status

#### POST `/api/ai/recompute-velocity`
Recomputes learning velocity based on historical data.

**Request Body**:
```json
{
  "familyId": "uuid",
  "childId": "uuid",
  "subjectId": "uuid"
}
```

### Planner Routes (`lib/apiRoutes.js`)

#### POST `/api/planner/preview`
Preview schedule proposal without committing.

#### POST `/api/planner/commit`
Commit schedule proposal to calendar.

#### POST `/api/planner/catchup`
Catch up on missed work.

### Flexible Tasks Routes (`lib/flexibleTasksRoutes.js`)

#### POST `/api/flexible/create`
Create backlog item or flexible event.

#### GET `/api/flexible/backlog`
Get flexible backlog.

#### POST `/api/flexible/schedule`
Auto-schedule a flexible task.

#### POST `/api/flexible/convert`
Convert backlog item to event.

### Syllabus Routes (`lib/syllabusRoutes.js`)

#### POST `/api/syllabus/upload`
Mark upload as syllabus.

#### GET `/api/syllabus/:id`
Get syllabus with sections.

#### POST `/api/syllabus/:id/suggest`
Generate scheduling suggestions from syllabus.

#### POST `/api/syllabus/:id/accept`
Accept suggestions and create events.

#### POST `/api/syllabus/:id/dismiss`
Dismiss suggestions.

#### PATCH `/api/events/:id/link-syllabus`
Link event to syllabus.

#### GET `/api/syllabus/compare-week`
Compare progress vs syllabus for a week.

### External Content Routes (`lib/apiRoutes.js`)

#### GET `/api/external/courses`
List available external courses.

#### GET `/api/external/courses/:id/outline`
Get course outline.

#### POST `/api/external/schedule_course`
Schedule external course content.

### ICS Routes (`lib/apiRoutes.js`)

#### GET `/api/ics/family.ics`
Export family calendar as ICS.

#### GET `/api/ics/child/:id.ics`
Export child calendar as ICS.

### Search Routes (`lib/apiRoutes.js`)

#### GET `/api/search`
Global search across events, tasks, documents.

## 8. Scheduling Algorithm Details

### Greedy Packing Algorithm

The `packEventsIntoGaps` function in `lib/aiReschedulingRoutes.js` implements a greedy packing algorithm:

1. **Sort needs by priority**:
   - Hard-due items first
   - Then by largest deficit
   - Then by required minutes

2. **For each need**:
   - Calculate remaining minutes (required - done - scheduled)
   - Try to place in existing flexible events first (same subject)
   - Find gaps in available time slots
   - Pack events respecting constraints:
     - Max 240 minutes per day
     - Max 90 minutes per block
     - Min 30 minutes per block
     - Avoid blackout days
     - Stay within teach windows

3. **Track per-day scheduled minutes** to enforce daily cap

### Constraints

- **Daily cap**: 240 minutes per day maximum
- **Block sizes**: 30-90 minutes per block
- **Blackouts**: Never schedule during blackout periods
- **Availability**: Only schedule during `teach` days from cache
- **Existing events**: Never double-book

### Learning Velocity

The system supports adaptive pacing via `learning_velocity` table:
- Range: 0.6 (slower) to 1.5 (faster)
- Multiplies required minutes per subject
- Example: If velocity is 0.8, child needs 80% of normal time (works faster)

## 9. UI Components

### Schedule Rules Management
- **Component**: `ScheduleRulesView` (`components/ScheduleRulesView.js`)
- **Sub-components**:
  - `WeeklyTemplateEditor` - Edit recurring rules
  - `OverridesDrawer` - Manage one-time overrides
  - `PreviewHeatmap` - Visual preview of availability
  - `ConflictsList` - Show scheduling conflicts

### Blackout Management
- **Component**: `BlackoutPanel` (`components/planner/BlackoutPanel.js`)
- Features: Create, view, delete blackouts

### Planner Week View
- **Component**: `PlannerWeek` (`components/planner/PlannerWeek.js`)
- Features:
  - Week grid showing all events
  - Draggable events (reschedule by dragging)
  - Click empty cell to quick-add
  - Shows availability overlay
  - Child filter
  - Pack This Week button
  - Rebalance button

### AI Tools
- **Component**: `ToolContent` (`components/ToolContent.js`)
- Features:
  - Rebalance Schedule
  - Pack This Week (opens `PackWeekModal`)
  - What-If Analysis
  - Schedule setup
  - Catch Up
  - Summarize Progress
  - Analytics
  - Heatmap (`CurriculumHeatmap`)

### Curriculum Heatmap
- **Component**: `CurriculumHeatmap` (`components/year/CurriculumHeatmap.js`)
- Features: Visual heatmap showing subject coverage over time

## 10. Complete Example Flow

### Scenario: Schedule Max's Math for next week with a blackout

#### Step 1: Setup Rules (one-time)
```
Go to: Settings → Schedule Rules
Add rule:
  - Title: "Max's School Days"
  - Type: Availability - Teach
  - Days: Mon-Fri
  - Time: 9am - 3pm
  - Scope: Child (Max)
```

#### Step 2: Create Blackout
```
Go to: Settings → Blackouts
Add blackout:
  - Applies to: Max
  - Start: 2025-11-05
  - End: 2025-11-07
  - Reason: "Testing week"
```

**What happens**:
- Creates `blackout_periods` record
- Creates `schedule_overrides` with `day_off` for Nov 5, 6, 7
- Refreshes `calendar_days_cache` for those dates

#### Step 3: Set Goals
```
Go to: Children → Max → Goals
Add goal:
  - Subject: Algebra I
  - Target: 180 min/week
  - Min block: 30 min
  - Max block: 60 min
```

#### Step 4: Run AI Rebalance
```
Go to: Planner → Rebalance Schedule
Select: Max
Week: Nov 3-9, 2025
Click: "Run Rebalance"
```

**Backend process**:
1. Loads rules, overrides, events, syllabi, velocities, blackouts
2. Calculates deficits:
   - Required: 180 min/week (from syllabus + velocity)
   - Done: 0 min
   - Scheduled: 0 min
   - Deficit: 180 min
3. Computes free gaps:
   - Nov 3 (Mon): 9am-3pm available (360 min)
   - Nov 4 (Tue): 9am-3pm available (360 min)
   - Nov 5 (Wed): OFF (blackout)
   - Nov 6 (Thu): OFF (blackout)
   - Nov 7 (Fri): OFF (blackout)
   - Nov 8 (Sat): OFF (no rule)
   - Nov 9 (Sun): OFF (no rule)
4. Packs events:
   - Nov 3: 9-10am Math (60 min)
   - Nov 3: 1-2pm Math (60 min)
   - Nov 4: 9-10am Math (60 min)
   - Total: 180 min ✅
5. Creates `ai_plans` record (status: draft)
6. Creates `ai_plan_changes` records (3 adds)

#### Step 5: Preview & Approve
```
UI shows:
  ✓ 3 new Math sessions
  ✓ 180 minutes scheduled
  ✓ Avoids blackout days (Nov 5-7)
  ✓ Goal: 100% complete

Click: "Approve All" or select individual changes
```

**Backend process**:
1. Calls `PATCH /api/ai/approve`
2. Inserts 3 events into `events` table
3. Marks changes as applied
4. Updates plan status to "applied"

#### Step 6: View in Calendar
```
Go to: Planner (week view)
See: 
  - Nov 3: Math 9-10am, Math 1-2pm
  - Nov 4: Math 9-10am
  - Nov 5-7: Blackout (grayed out)
```

## 11. Key Features

### Specificity Cascade
- Toggle between "Add-Remove Math" and "Child rules override family rules"
- Controlled via `specificity_cascade` setting in `family_settings`
- When enabled, child rules take precedence over family rules

### Adaptive Pacing
- Learning velocity adjusts required minutes per subject
- Range: 0.6 (slower) to 1.5 (faster)
- Automatically computed or manually set

### Proposal-Based Scheduling
- AI generates proposals (doesn't auto-apply)
- User can approve/reject individual changes
- Edits allowed before approval
- Atomic application of approved changes

### Conflict Detection
- System detects scheduling conflicts
- Shows conflicts in UI
- Suggests resolutions

### Cache Performance
- Pre-computed availability for fast lookups
- Auto-updates via triggers
- Manual refresh available
- Used by all scheduling operations

## 12. Summary

The scheduling system provides:

✅ **Flexible Rules**: Recurring patterns with priority system
✅ **One-Time Overrides**: Exceptions for specific dates
✅ **Blackout Periods**: Planned absences with automatic override creation
✅ **Cached Availability**: Fast lookups via pre-computed cache
✅ **AI Optimization**: Multiple tools for schedule optimization
✅ **Proposal System**: Review before applying changes
✅ **Adaptive Pacing**: Velocity-adjusted scheduling
✅ **Conflict Avoidance**: Respects blackouts, availability, existing events
✅ **Multi-Scope**: Family-wide or child-specific rules/overrides/blackouts

The system is designed to handle complex scheduling scenarios while maintaining performance through caching and providing intelligent automation through AI tools.

