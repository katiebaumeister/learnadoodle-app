# How AI Scheduling & Scheduling Rules Work

## 🎯 Overview

Your app has a sophisticated multi-layered scheduling system that combines:
1. **Scheduling Rules** (recurring availability patterns)
2. **Schedule Overrides** (one-time exceptions)
3. **Calendar Cache** (pre-computed availability)
4. **AI Scheduling** (intelligent event placement)
5. **Events** (actual scheduled items)

## 📊 The Data Flow

```
┌─────────────────────┐
│  Schedule Rules     │ ← "Max has Math Mon/Wed/Fri 9-11am"
│  (recurring)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Schedule Overrides  │ ← "Oct 20: Day off" or "Late start 10am"
│ (one-time changes)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Calendar Days Cache │ ← Pre-computed: "Oct 18: teach 9am-3pm"
│ (computed result)   │   "Oct 20: off"
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   AI Scheduler      │ ← Finds open slots, packs events
│   (PlannerService)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Events         │ ← Actual scheduled lessons/activities
│  (what shows up)    │
└─────────────────────┘
```

---

## 1️⃣ Scheduling Rules System

### **What are Schedule Rules?**

Recurring patterns that define when teaching/learning happens.

**Table**: `schedule_rules`

**Types**:
- `availability_teach` - "Available for teaching"
- `availability_off` - "Not available (off day)"
- `activity_default` - "Default activity settings"

**Scope**:
- `family` - Applies to entire household
- `child` - Applies to specific child

### **How Rules Work**

**Example Rule**:
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

**This means**: 
- Max is available for teaching Monday-Friday
- 9:00 AM to 3:00 PM
- From Sept 1, 2025 to June 30, 2026
- Priority 100 (default)

### **Priority System**

When rules overlap, **higher priority wins**.

**Example**:
```
Rule 1: Family rule - "No teaching on Fridays" (priority 90)
Rule 2: Max rule - "Extra Friday tutoring" (priority 110)
```
→ **Max's rule wins** (110 > 90), so Max has teaching on Friday.

### **How Rules Are Stored**

```sql
CREATE TABLE schedule_rules (
    id UUID PRIMARY KEY,
    scope_type TEXT, -- 'family' or 'child'
    scope_id UUID,   -- family_id or child_id
    rule_type TEXT,  -- 'availability_teach', 'availability_off', etc.
    title TEXT,
    start_date DATE,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    rrule JSONB,     -- Recurrence rule (RFC5545 format)
    priority INTEGER,
    is_active BOOLEAN
);
```

---

## 2️⃣ Schedule Overrides

### **What are Overrides?**

One-time changes to the schedule for specific dates.

**Table**: `schedule_overrides`

**Types**:
- `day_off` - Completely off (e.g., sick day, vacation)
- `late_start` - Start later than usual
- `early_end` - End earlier than usual
- `extra_block` - Add extra teaching time
- `cancel_block` - Cancel a specific time slot

### **How Overrides Work**

**Example**:
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

**Result**:
- Normal rule: Max available 9am-3pm
- Override: Start at 11am instead
- **Effective availability: 11am-3pm on Oct 20**

### **Override Priority**

Overrides **always win** over rules for that specific date.

---

## 3️⃣ Calendar Days Cache

### **What is the Cache?**

Pre-computed daily availability for fast lookups.

**Table**: `calendar_days_cache`

**Why it exists**:
- Rules + overrides are complex to calculate in real-time
- Cache stores the final result per day
- Updates automatically when rules/overrides change

### **Cache Structure**

```sql
CREATE TABLE calendar_days_cache (
    id UUID PRIMARY KEY,
    family_id UUID,
    child_id UUID,
    date DATE,
    day_status TEXT,      -- 'teach', 'off', 'partial'
    teach_minutes INTEGER, -- Total available teaching minutes
    start_time TIME,
    end_time TIME,
    source_rule_id UUID,   -- Which rule created this
    computed_at TIMESTAMPTZ
);
```

### **How Cache Updates**

**Automatically via triggers**:
```sql
-- When a rule is added/changed/deleted
CREATE TRIGGER schedule_rules_cache_refresh
AFTER INSERT OR UPDATE OR DELETE ON schedule_rules
FOR EACH ROW EXECUTE FUNCTION refresh_calendar_cache_trigger();

-- When an override is added/changed/deleted
CREATE TRIGGER schedule_overrides_cache_refresh
AFTER INSERT OR UPDATE OR DELETE ON schedule_overrides
FOR EACH ROW EXECUTE FUNCTION refresh_calendar_cache_trigger();
```

**Result**: Cache stays in sync automatically! 🎉

### **Cache Query Example**

To get Max's availability for a week:

```sql
SELECT date, day_status, teach_minutes, start_time, end_time
FROM calendar_days_cache
WHERE child_id = 'max-uuid'
  AND date >= '2025-10-20'
  AND date <= '2025-10-26'
ORDER BY date;
```

**Response**:
```
date       | day_status | teach_minutes | start_time | end_time
-----------|------------|---------------|------------|----------
2025-10-20 | teach      | 360           | 09:00      | 15:00
2025-10-21 | teach      | 360           | 09:00      | 15:00
2025-10-22 | off        | 0             | null       | null
2025-10-23 | teach      | 360           | 09:00      | 15:00
...
```

---

## 4️⃣ AI Scheduling Algorithm

### **What the AI Scheduler Does**

The `PlannerService` (in `lib/plannerService.js`) intelligently schedules events based on:
- Available time slots (from cache)
- Learning goals (from `subject_goals`)
- Existing events (to avoid conflicts)
- Constraints (min/max block size, spacing rules)

### **How AI Scheduling Works**

#### **Step 1: Get Input Data**

```javascript
const input = {
  childId: "max-uuid",
  familyId: "family-uuid",
  fromDate: "2025-10-20",
  toDate: "2025-10-27",
  goals: [
    {
      subject_id: "math-uuid",
      subject: "Algebra I",
      target_minutes: 180,      // Want 180 min/week
      scheduled_minutes: 60,    // Already have 60 min
      min_block: 30,            // Min session: 30 min
      max_block: 60             // Max session: 60 min
    },
    {
      subject_id: "science-uuid",
      subject: "Biology",
      target_minutes: 120,
      scheduled_minutes: 0,
      min_block: 45,
      max_block: 90
    }
  ]
};
```

#### **Step 2: Get Availability**

```javascript
// Calls: get_child_availability(child_id, from_date, to_date)
const availability = await supabase.rpc('get_child_availability', {
  _child: childId,
  _from: fromDate,
  _to: toDate
});

// Returns:
// [
//   { date: '2025-10-20', day_status: 'teach', available_blocks: [...] },
//   { date: '2025-10-21', day_status: 'teach', available_blocks: [...] },
//   { date: '2025-10-22', day_status: 'off', available_blocks: [] },
//   ...
// ]
```

#### **Step 3: Get Existing Events**

```javascript
const { data: existingEvents } = await supabase
  .from('events')
  .select('*')
  .eq('child_id', childId)
  .gte('start_ts', fromDate)
  .lte('start_ts', toDate);

// Returns events already scheduled to avoid double-booking
```

#### **Step 4: Run Packing Algorithm**

```javascript
async packEvents({ availability, goals, existingEvents, childId, familyId }) {
  const scheduledEvents = [];
  
  // For each goal that needs more time
  for (const goal of goals) {
    const remainingMinutes = goal.target_minutes - goal.scheduled_minutes;
    if (remainingMinutes <= 0) continue; // Goal already met
    
    let scheduledForGoal = 0;
    
    // For each available day
    for (const day of availability) {
      if (day.day_status === 'off') continue;
      
      // Find open slots (not taken by existing events)
      const availableSlots = this.findAvailableSlots(day, existingEvents, scheduledEvents);
      
      // Schedule events in available slots
      for (const slot of availableSlots) {
        if (scheduledForGoal >= remainingMinutes) break;
        
        const slotDuration = calculateDuration(slot.start, slot.end);
        const eventDuration = Math.min(
          slotDuration,
          remainingMinutes - scheduledForGoal,
          goal.max_block || 60
        );
        
        // Respect minimum block size
        if (eventDuration < goal.min_block) continue;
        
        // Create event
        const event = {
          id: generateId(),
          child_id: childId,
          family_id: familyId,
          subject_id: goal.subject_id,
          title: `${goal.subject} - ${eventDuration} min`,
          start_ts: slot.start,
          end_ts: addMinutes(slot.start, eventDuration),
          status: 'scheduled',
          source: 'ai',
          duration_minutes: eventDuration
        };
        
        scheduledEvents.push(event);
        scheduledForGoal += eventDuration;
      }
    }
  }
  
  return scheduledEvents;
}
```

#### **Step 5: Return Proposal**

```javascript
return {
  proposal_id: generateProposalId(),
  events: scheduledEvents, // Array of proposed events
  metadata: {
    total_events: scheduledEvents.length,
    goals_met: goals.filter(g => g.scheduled_minutes >= g.target_minutes).length,
    total_minutes_scheduled: scheduledEvents.reduce((sum, e) => sum + e.duration_minutes, 0)
  },
  generated_at: new Date().toISOString()
};
```

### **AI Scheduling Constraints**

The algorithm respects:

1. **Min/Max Block Size**
   - Won't schedule < `min_block` minutes
   - Won't exceed `max_block` minutes

2. **Subject Spacing** (optional)
   - `spread_same_subject`: Avoid back-to-back sessions

3. **Existing Events**
   - Never double-books
   - Finds gaps between scheduled items

4. **Availability**
   - Only schedules during `teach` days
   - Respects `start_time` and `end_time`

### **Example AI Scheduling Run**

**Input**:
- Child: Max
- Week: Oct 20-26, 2025
- Goal: Need 120 more minutes of Math
- Availability: Mon-Fri 9am-3pm (360 min/day)
- Existing: Has Science on Mon 9-10am

**AI Output**:
```json
{
  "events": [
    {
      "title": "Algebra I - 60 min",
      "start_ts": "2025-10-20T10:00:00", // Mon after Science
      "end_ts": "2025-10-20T11:00:00",
      "subject": "Algebra I",
      "duration_minutes": 60
    },
    {
      "title": "Algebra I - 60 min",
      "start_ts": "2025-10-22T09:00:00", // Wed morning
      "end_ts": "2025-10-22T10:00:00",
      "subject": "Algebra I",
      "duration_minutes": 60
    }
  ],
  "metadata": {
    "total_events": 2,
    "total_minutes_scheduled": 120,
    "goals_met": 1
  }
}
```

---

## 5️⃣ AI Rescheduling Service

### **What is AI Rescheduling?**

When events need to be moved (e.g., conflict, cancellation), the AI suggests alternative times.

**Service**: `aiReschedulingService.js`

### **How Rescheduling Works**

#### **Step 1: Detect Conflict/Cancellation**

```javascript
// User marks event as canceled
await supabase.from('events').update({
  status: 'canceled'
}).eq('id', eventId);
```

#### **Step 2: Find Alternative Slots**

```javascript
const suggestions = await aiReschedulingService.suggestRescheduling(eventId);

// Service does:
// 1. Get the canceled event details
// 2. Get applicable rules for that child/date range
// 3. Get overrides
// 4. Get existing events
// 5. Find open slots that fit the duration
```

#### **Step 3: Return Suggestions**

```javascript
{
  "original_event": {
    "id": "event-uuid",
    "title": "Math - 60 min",
    "start_ts": "2025-10-20T09:00:00",
    "end_ts": "2025-10-20T10:00:00"
  },
  "suggestions": [
    {
      "date": "2025-10-20",
      "start_time": "14:00",
      "end_time": "15:00",
      "confidence": "high",
      "reason": "Same day, afternoon slot available"
    },
    {
      "date": "2025-10-21",
      "start_time": "09:00",
      "end_time": "10:00",
      "confidence": "medium",
      "reason": "Next day, morning slot"
    }
  ]
}
```

#### **Step 4: User Accepts**

```javascript
// User clicks "Move to Tuesday 9am"
await supabase.from('events').update({
  start_ts: '2025-10-21T09:00:00',
  end_ts: '2025-10-21T10:00:00',
  status: 'scheduled'
}).eq('id', eventId);
```

---

## 🔧 Key Database Functions

### **1. `get_child_availability`**

**Purpose**: Get daily availability for a child

```sql
SELECT * FROM get_child_availability(
  _child := 'max-uuid',
  _from := '2025-10-20',
  _to := '2025-10-26'
);
```

**Returns**:
```json
[
  {
    "date": "2025-10-20",
    "day_status": "teach",
    "start_time": "09:00",
    "end_time": "15:00",
    "available_blocks": [
      {"start": "09:00", "end": "12:00"},
      {"start": "13:00", "end": "15:00"}
    ]
  },
  ...
]
```

### **2. `refresh_calendar_days_cache`**

**Purpose**: Recompute cache for a date range

```sql
SELECT refresh_calendar_days_cache(
  p_family_id := 'family-uuid',
  p_start_date := '2025-10-01',
  p_end_date := '2025-10-31'
);
```

**What it does**:
1. Deletes old cache for that range
2. Processes all active rules
3. Applies all overrides
4. Resolves conflicts by priority
5. Stores final result in `calendar_days_cache`

### **3. `check_scheduling_conflict`**

**Purpose**: Check if a proposed event conflicts

```sql
SELECT check_scheduling_conflict(
  p_child_id := 'max-uuid',
  p_start_ts := '2025-10-20 09:00',
  p_end_ts := '2025-10-20 10:00'
);
```

**Returns**: `true` if conflict, `false` if clear

### **4. `find_available_slots`**

**Purpose**: Find all open time slots for a day

```sql
SELECT * FROM find_available_slots(
  p_child_id := 'max-uuid',
  p_date := '2025-10-20',
  p_duration_minutes := 60
);
```

**Returns**:
```json
[
  {"start": "09:00", "end": "10:00", "duration_minutes": 60},
  {"start": "11:00", "end": "12:30", "duration_minutes": 90},
  {"start": "14:00", "end": "15:00", "duration_minutes": 60}
]
```

---

## 📱 UI Integration

### **Where Rules Are Managed**

**Component**: `ScheduleRulesView` (via sidebar → Planner → Schedule Rules)

**Features**:
- Visual heatmap preview (next 14 days)
- Add/edit/delete rules
- Drag to reorder priority
- Toggle active/inactive
- Add one-time overrides

### **Where AI Planner Lives**

**Component**: `AIPlannerView` (via sidebar → Planner → AI Planner)

**Features**:
- Select child(ren)
- Set date range
- Define goals (subject + target minutes)
- Click "Generate Plan"
- Preview proposed events
- Click "Commit to Calendar" to schedule

### **Where Scheduling Happens**

**Component**: `PlannerWeek` (sidebar → Planner)

**Features**:
- Week grid showing all events
- Draggable events (reschedule by dragging)
- Click empty cell to quick-add
- Shows availability overlay (teach/off days)
- Child filter to show specific children

---

## 🎯 Complete Example Flow

### **Scenario**: Schedule Max's Math for next week

#### **1. Setup Rules** (one-time)

```
Go to: Planner → Schedule Rules
Add rule:
  - Title: "Max's School Days"
  - Type: Availability - Teach
  - Days: Mon-Fri
  - Time: 9am - 3pm
  - Recurring: Weekly
```

**Database**:
```sql
INSERT INTO schedule_rules (...) VALUES (
  scope_type: 'child',
  scope_id: 'max-uuid',
  rule_type: 'availability_teach',
  rrule: '{"freq":"WEEKLY","byweekday":["MO","TU","WE","TH","FR"]}',
  start_time: '09:00',
  end_time: '15:00'
);

-- Trigger fires → refreshes calendar_days_cache
```

#### **2. Add Override** (optional)

```
Go to: Planner → Schedule Rules → Overrides
Add override:
  - Date: Oct 20
  - Type: Late Start
  - Start Time: 11am
  - Reason: "Doctor appointment"
```

**Database**:
```sql
INSERT INTO schedule_overrides (...) VALUES (
  scope_type: 'child',
  scope_id: 'max-uuid',
  date: '2025-10-20',
  override_kind: 'late_start',
  start_time: '11:00'
);

-- Trigger fires → updates cache for Oct 20
```

#### **3. Set Goals**

```
Go to: Children → Max → View Profile → Goals
Add goal:
  - Subject: Algebra I
  - Target: 180 min/week
  - Min block: 30 min
  - Max block: 60 min
```

**Database**:
```sql
INSERT INTO subject_goals (...) VALUES (
  child_id: 'max-uuid',
  subject_id: 'math-uuid',
  target_minutes_per_week: 180,
  min_block: 30,
  max_block: 60
);
```

#### **4. Run AI Planner**

```
Go to: Planner → AI Planner
- Select child: Max
- Select week: Oct 20-26
- Goals auto-populate from subject_goals
- Click "Generate Plan"
```

**Backend**:
```javascript
// 1. Get availability from cache
const availability = await supabase.rpc('get_child_availability', {
  _child: 'max-uuid',
  _from: '2025-10-20',
  _to: '2025-10-26'
});
// Returns: Mon (11am-3pm), Tue-Fri (9am-3pm), Sat-Sun (off)

// 2. Get existing events
const existing = await supabase.from('events')
  .select('*')
  .eq('child_id', 'max-uuid')
  .gte('start_ts', '2025-10-20')
  .lte('start_ts', '2025-10-26');
// Returns: Science Mon 11-12pm

// 3. Run packing algorithm
const proposal = await plannerService.generateProposal({
  childId: 'max-uuid',
  familyId: 'family-uuid',
  fromDate: '2025-10-20',
  toDate: '2025-10-26',
  goals: [{ subject: 'Algebra I', target: 180, scheduled: 0, min: 30, max: 60 }]
});

// AI finds:
// - Mon 12-1pm (60 min) - after Science
// - Tue 9-10am (60 min)
// - Wed 9-10am (60 min)
// Total: 180 min ✅
```

#### **5. Preview & Commit**

```
UI shows:
  ✓ 3 new Math sessions
  ✓ 180 minutes scheduled
  ✓ Goal: 100% complete

Click "Commit to Calendar"
```

**Database**:
```sql
INSERT INTO events (title, child_id, start_ts, end_ts, subject_id, status, source)
VALUES
  ('Algebra I - 60 min', 'max-uuid', '2025-10-20 12:00', '2025-10-20 13:00', 'math-uuid', 'scheduled', 'ai'),
  ('Algebra I - 60 min', 'max-uuid', '2025-10-21 09:00', '2025-10-21 10:00', 'math-uuid', 'scheduled', 'ai'),
  ('Algebra I - 60 min', 'max-uuid', '2025-10-22 09:00', '2025-10-22 10:00', 'math-uuid', 'scheduled', 'ai');
```

#### **6. View in Calendar**

```
Go to: Planner (week view)
See: All 3 Math sessions + original Science session
Can: Drag to reschedule, click to edit, mark as done
```

---

## 🔍 Troubleshooting

### **"Heatmap shows all days as OFF"**

**Cause**: Cache is empty or stale

**Fix**:
```javascript
// In UI, click "Refresh Cache" button
await supabase.rpc('refresh_calendar_days_cache', {
  p_family_id: familyId,
  p_start_date: '2025-10-01',
  p_end_date: '2025-12-31'
});
```

### **"AI Planner finds no slots"**

**Causes**:
1. No teaching rules defined
2. All days marked as off
3. All slots filled with existing events

**Fix**:
1. Add at least one `availability_teach` rule
2. Check `calendar_days_cache` for that date range
3. Review existing events for conflicts

### **"Events not showing up"**

**Check**:
```sql
-- 1. Are events created?
SELECT * FROM events WHERE child_id = 'max-uuid' AND status = 'scheduled';

-- 2. Is availability computed?
SELECT * FROM calendar_days_cache WHERE child_id = 'max-uuid' AND date >= CURRENT_DATE;

-- 3. Are rules active?
SELECT * FROM schedule_rules WHERE scope_id = 'max-uuid' AND is_active = true;
```

---

## 🎉 Summary

### **How It All Works Together**

1. **You define rules** → Stored in `schedule_rules`
2. **You add overrides** → Stored in `schedule_overrides`
3. **Cache auto-updates** → Triggers keep `calendar_days_cache` current
4. **AI reads cache** → Finds available slots
5. **AI packs events** → Respects goals, constraints, existing events
6. **Events are created** → Stored in `events` table
7. **UI shows results** → Calendar displays scheduled items

### **Key Advantages**

✅ **Flexible**: Rules + overrides handle any schedule
✅ **Fast**: Cache makes lookups instant
✅ **Smart**: AI respects all constraints
✅ **Automatic**: Triggers keep everything in sync
✅ **Scalable**: Works for 1 child or 10 children

### **What's Actually Running**

When you click "Generate Plan":
1. `get_child_availability` RPC (reads cache)
2. `plannerService.generateProposal()` (packs events)
3. Preview UI (shows proposal)
4. On commit: `INSERT INTO events` (saves to DB)
5. Calendar rerenders with new events

**That's it!** All the complexity is hidden behind a simple "Generate Plan" button. 🎉

---

## 📚 Related Files

- `lib/plannerService.js` - AI scheduling algorithm
- `lib/aiReschedulingService.js` - Reschedule suggestions
- `database-migration-schedule-rules.sql` - Rules/cache schema
- `create-availability-api.sql` - Availability functions
- `components/ScheduleRulesView.js` - Rules UI
- `components/AIPlannerView.js` - AI planner UI
- `components/planner/PlannerWeek.js` - Week grid

