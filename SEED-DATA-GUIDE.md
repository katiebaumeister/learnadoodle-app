# Seed Data Guide - Max & Lilly School Year

## Overview
This seed script creates a fully realistic homeschool setup for Max (Grade 5) and Lilly (Grade 3) with 3 months of historical data and 2 weeks of planned lessons.

## What Gets Created

### 👦👧 **2 Children**
- **Max** - Grade 5, Age 10 (born March 15, 2014)
- **Lilly** - Grade 3, Age 8 (born July 22, 2016)

### 📚 **6 Subjects** (for each child)
1. **Math** (Blue 🔵) - 5 hours/week goal
2. **Reading** (Green 🟢) - 5 hours/week goal
3. **Science** (Purple 🟣) - 3 hours/week goal
4. **Writing** (Pink 🩷) - 3 hours/week goal
5. **History** (Orange 🟠) - 2 hours/week goal
6. **Art** (Red 🔴) - 2 hours/week goal

### 📅 **4 Schedule Rules** (Add-Remove Math!)

**Family Rules:**
1. **School Hours** (TEACH) - Mon-Fri, 9:00am-3:00pm
   - Adds 6 hours/day × 5 days = 30 hours/week
   
2. **Lunch Break** (OFF) - Mon-Fri, 12:00pm-1:00pm
   - Removes 1 hour/day × 5 days = 5 hours/week
   
**Net family availability: 25 hours/week**

**Child-Specific Rules:**
3. **Max: Piano Lesson** (OFF) - Monday, 10:00am-11:00am
   - Removes 1 hour on Mondays
   - Max Monday: 4 hours available
   
4. **Lilly: Dance Class** (OFF) - Wednesday, 2:00pm-3:00pm
   - Removes 1 hour on Wednesdays
   - Lilly Wednesday: 4 hours available

### 📊 **~180 Attendance Records**
- Last 90 school days (Mon-Fri only)
- Max: 95% present, 5% sick/tardy
- Lilly: 93% present, 7% sick/tardy
- Realistic minutes_present (300 min when present)

### 📝 **~500 Past Events** (Last 60 days, completed)

**Max's Daily Schedule** (completed events):
- 9:00-10:00: Math (Tue-Fri; Mon is piano)
- 10:00-11:00: Reading (11:00-12:00 on Mondays)
- 1:00-2:00: Science
- 2:00-3:00: Writing

**Lilly's Daily Schedule** (completed events):
- 9:00-10:00: Reading
- 10:00-11:00: Math
- 1:00-2:00: Art (Mon, Tue, Thu, Fri; Wed is dance)

### 📆 **~90 Scheduled Events** (Next 2 weeks)

**This Week:**
- Status: `scheduled` (future) or `in_progress` (today) or `done` (past)
- Same subjects as historical pattern
- Ready to mark complete as days pass

**Next Week:**
- Status: `scheduled`
- Full week planned
- Can reschedule via drag & drop

### 🎯 **Subject Goals**

**Max's Weekly Goals:**
- Math: 300 min/week (5 hours)
- Reading: 300 min/week (5 hours)
- Science: 180 min/week (3 hours)
- Writing: 180 min/week (3 hours)
- History: 120 min/week (2 hours)
- Art: 120 min/week (2 hours)
**Total: 20 hours/week**

**Lilly's Weekly Goals:**
- Reading: 300 min/week (5 hours)
- Math: 300 min/week (5 hours)
- Art: 180 min/week (3 hours)
- Science: 120 min/week (2 hours)
- Writing: 120 min/week (2 hours)
**Total: 18 hours/week**

### 📋 **8 Backlog Items** (Unscheduled tasks)

**Max's Backlog:**
1. Long Division Practice (30 min, High priority)
2. Volcano Experiment (60 min, Medium priority)
3. Book Report on Charlotte's Web (45 min, High priority)
4. Revolutionary War Timeline (60 min, Medium priority)

**Lilly's Backlog:**
1. Counting by 5s (20 min, High priority)
2. Sight Words Review (30 min, High priority)
3. Fall Painting (45 min, Low priority)
4. Plant Growth Observation (15 min, Medium priority)

## 📊 What You'll See After Seeding

### Home Screen
```
Today's Learning (Monday, Oct 20)
─────────────────────────────────
Max:
  ✓ Reading - Novel Study (11:00-12:00) DONE
  → Science Lab (1:00-2:00) IN PROGRESS
  • Writing Assignment (2:00-3:00) SCHEDULED

Lilly:
  ✓ Reading Practice (9:00-10:00) DONE
  ✓ Math Worksheet (10:00-11:00) DONE
  • Art Time (1:00-2:00) SCHEDULED
```

### Planner (Week View)
```
This Week: Oct 20-26
Capacity: 75% (450 min planned / 600 min available)

Mon  Tue  Wed  Thu  Fri  Sat  Sun
─────────────────────────────────
Max:
11a  9a   9a   9a   9a   OFF  OFF
READ MATH MATH MATH MATH
1p   10a  10a  10a  10a
SCI  READ READ READ READ
2p   1p   1p   1p   1p
WRI  SCI  SCI  SCI  SCI
     2p   2p   2p   2p
     WRI  WRI  WRI  WRI

Lilly:
9a   9a   9a   9a   9a   OFF  OFF
READ READ READ READ READ
10a  10a  10a  10a  10a
MATH MATH MATH MATH MATH
1p   1p   ---  1p   1p
ART  ART  DANC ART  ART
```

### Children Profiles
```
Max (Grade 5)
─────────────
This Week Progress:
  Math: 240/300 min (80%)
  Reading: 300/300 min (100%) ✓
  Science: 180/180 min (100%) ✓
  Writing: 180/180 min (100%) ✓

Timeline:
  ✓ Math - Chapter 15 (Today, 9:00am)
  ✓ Reading - Novel Study (Today, 11:00am)
  → Science Lab (In progress, 1:00pm)
  • Writing Assignment (Upcoming, 2:00pm)
```

### Attendance
```
October 2025
─────────────────────────────────
     M   T   W   T   F   S   S
     6   7   8   9  10  11  12
     ✓   ✓   ✓   ✓   ✓   -   -
    13  14  15  16  17  18  19
     ✓   ✓   T   ✓   ✓   -   -
    20  21  22  23  24  25  26
     ✓   ?   ?   ?   ?   -   -

Summary:
Max: 90% attendance (45/50 days)
Lilly: 88% attendance (44/50 days)
```

### Scheduling Rules
```
Family Rules:
┌─────────────────────────────────┐
│ School Hours  [Add Time] 🟢    │
│ 9:00-15:00 • Mon-Fri            │
│ ─────────────────────────────── │
│ Lunch Break  [Block Time] 🔴   │
│ 12:00-13:00 • Mon-Fri           │
└─────────────────────────────────┘

Max's Rules:
┌─────────────────────────────────┐
│ Piano Lesson  [Block Time] 🔴  │
│ 10:00-11:00 • Monday            │
└─────────────────────────────────┘

Lilly's Rules:
┌─────────────────────────────────┐
│ Dance Class  [Block Time] 🔴   │
│ 14:00-15:00 • Wednesday         │
└─────────────────────────────────┘
```

### Backlog Drawer
```
Unscheduled Tasks (8)
─────────────────────
High Priority (4):
  • Long Division Practice (Max, 30m)
  • Book Report (Max, 45m)
  • Counting by 5s (Lilly, 20m)
  • Sight Words (Lilly, 30m)

Medium Priority (3):
  • Volcano Experiment (Max, 60m)
  • Timeline Project (Max, 60m)
  • Plant Growth (Lilly, 15m)

Low Priority (1):
  • Fall Painting (Lilly, 45m)
```

## 🚀 Running the Seed

### Prerequisites
Make sure you've run:
1. ✅ Database consolidation: `20251020_database_consolidation.sql`
2. ✅ Add-Remove rules: `20251018_add_remove_rules_fixed.sql`

### Run Seed
```sql
-- In Supabase SQL Editor
-- Copy/paste: seed_max_lilly_schoolyear.sql
-- Execute
-- Watch NOTICE messages
```

### Expected Output
```
╔════════════════════════════════════════╗
║  SEEDING MAX & LILLY SCHOOL YEAR       ║
╚════════════════════════════════════════╝

👦👧 Creating children...
  ✓ Created Max (Grade 5, Age 10)
  ✓ Created Lilly (Grade 3, Age 8)

📚 Creating subjects...
  ✓ Created 6 subjects

📅 Creating schedule rules...
  ✓ Created 4 scheduling rules (2 teach, 2 off)
  ✓ Refreshed availability cache

📊 Creating attendance records...
  ✓ Created ~180 attendance records

📝 Creating past events...
  ✓ Created ~500 completed events

📆 Creating current/future events...
  ✓ Created events for next 2 weeks

🎯 Creating subject goals...
  ✓ Created subject goals for both children

📋 Creating learning backlog...
  ✓ Created 8 backlog items

╔════════════════════════════════════════╗
║  SEED DATA COMPLETE!                   ║
╚════════════════════════════════════════╝

🎉 Your homeschool is ready to use!
```

## 🎯 What to Test After Seeding

### 1. Home Screen
- Should see today's events for Max and Lilly
- Daily insights showing completion %
- Next up tile with countdown

### 2. Planner (Month View)
- Should see events across the month
- Different colors for subjects
- Mini calendar with dots on scheduled days

### 3. Planner (Week View)
- Capacity meter showing ~75%
- Events in grid slots
- Backlog button with (8) badge

### 4. Children List
- Max and Lilly cards
- Progress rings showing completion
- Click to view profile

### 5. Child Profile
- Weekly overview with minutes
- Goals progress (with % completion)
- Timeline of events
- Next week plan

### 6. Attendance
- Calendar grid with checkmarks
- Summary stats (90%+ attendance)
- Export to CSV button

### 7. Scheduling Rules
- See 4 rules (2 family, 1 Max, 1 Lilly)
- Color badges (green teach, red off)
- Preview tab with Why chips
- Toggle Specificity Cascade

### 8. Backlog Drawer
- 8 tasks showing
- Filter by priority/child/subject
- Drag to schedule

## 📈 Data Statistics

### Total Records Created
- **Children**: 2
- **Subjects**: 6
- **Schedule Rules**: 4
- **Attendance**: ~180 records (90 days × 2 children)
- **Events**: ~500 past + ~90 future = ~590 total
- **Subject Goals**: 11 (6 for Max, 5 for Lilly)
- **Backlog Items**: 8

### Date Ranges
- **Attendance**: Last 90 days
- **Past Events**: Last 60 days (all marked "done")
- **Future Events**: Next 14 days (marked "scheduled")
- **Schedule Rules**: Sept 2024 - June 2025 (full school year)

### Time Distribution

**Max's Weekly Schedule:**
```
Monday:    4 hours (piano blocks 1 hour)
Tue-Fri:   5 hours each = 20 hours
Total:     24 hours/week available
Planned:   ~20 hours/week
Capacity:  ~83%
```

**Lilly's Weekly Schedule:**
```
Mon,Tue,Thu,Fri: 5 hours each = 20 hours
Wednesday:       4 hours (dance blocks 1 hour)
Total:           24 hours/week available
Planned:         ~18 hours/week
Capacity:        ~75%
```

## 🎨 Subject Color Coding

- 🔵 Math: `#3b82f6` (Blue)
- 🟢 Reading: `#10b981` (Green)
- 🟣 Science: `#8b5cf6` (Purple)
- 🟠 History: `#f59e0b` (Orange)
- 🩷 Writing: `#ec4899` (Pink)
- 🔴 Art: `#f97316` (Red)

## 🧪 Test Scenarios After Seeding

### Scenario 1: View Today's Schedule
1. Go to Home
2. Should see today's events for both children
3. Some marked DONE, some IN PROGRESS, some SCHEDULED

### Scenario 2: Test Add-Remove Math
1. Go to Planner → Scheduling Rules
2. Click Preview tab
3. Select Max
4. Click Why chip on Monday
5. Should see:
   - School Hours 9-3 (TEACH, family)
   - Lunch 12-1 (OFF, family)
   - Piano 10-11 (OFF, child)
   - **Result**: 9-10, 11-12, 1-3 = 4 hours

### Scenario 3: Test Capacity Planning
1. Go to Planner → Week View
2. Select "This Week"
3. Should see capacity meter ~75-80%
4. Click AI → Pack Week (shows alert for now)
5. Click Backlog
6. Should see 8 tasks ready to schedule

### Scenario 4: Test Drag & Drop
1. In Week View
2. Drag an event from one time slot to another
3. Should update and recalculate capacity

### Scenario 5: Test Kanban Board
1. Go to Planner → Kanban
2. Should see columns:
   - Planned: Future events
   - In Progress: Today's current events
   - Done: Completed events
   - Needs Review: (empty initially)

### Scenario 6: View Child Progress
1. Go to Children
2. Click Max's profile
3. Should see:
   - Weekly overview with completion %
   - Subject goals with progress rings
   - Timeline of recent events
   - Next week plan

### Scenario 7: Check Attendance
1. Go to Records → Attendance
2. Should see calendar with checkmarks
3. ~90% attendance for both children
4. Export to CSV button works

### Scenario 8: Test Specificity Cascade
1. Go to Scheduling Rules
2. Toggle Specificity Cascade ON
3. Add child-level TEACH rule that conflicts with family OFF
4. Go to Preview → Click Why chip
5. Should show child rule wins (cascade ON)
6. Toggle OFF
7. Should show pure Add-Remove math

## 🔧 Customization

Want to adjust the seed data? Edit these sections:

### Change Grade Levels
```sql
-- Line ~35
INSERT INTO children (family_id, first_name, grade_level, birth_date)
VALUES (v_family_id, 'Max', 7, '2012-03-15')  -- Change to grade 7
```

### Change Schedule Hours
```sql
-- Line ~95
INSERT INTO schedule_rules (..., start_time, end_time, ...)
VALUES (..., '08:00', '16:00', ...)  -- 8am-4pm instead
```

### Add More Subjects
```sql
-- After line 130
INSERT INTO subject (family_id, name, color, icon, description)
VALUES (v_family_id, 'Spanish', '#eab308', '🇪🇸', 'Foreign language');
```

### Change Weekly Goals
```sql
-- Line ~220
INSERT INTO subject_goals (child_id, subject_id, goal_minutes_per_week, ...)
VALUES (v_max_id, v_math_id, 400, ...)  -- 400 min instead of 300
```

## ⚠️ Important Notes

### Data Volume
- **~770 total database records** created
- **Realistic for active homeschool family**
- **Not too much** (loads quickly)
- **Enough to test all features**

### Date-Aware Logic
- Past events marked `done`
- Today's events marked `in_progress` (if afternoon) or `scheduled`
- Future events marked `scheduled`

### Idempotent
- Safe to run multiple times
- Uses `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE`
- Won't create duplicates

### Realistic Patterns
- Max (older) has more advanced subjects
- Lilly (younger) focuses on basics
- Both have extracurriculars (piano, dance)
- Attendance ~90-95% (realistic for homeschool)

## 🎉 Result

After running this seed, your app will look like an **actively used homeschool planner** with:

✅ Historical data (proves system works over time)
✅ Current week (shows today's learning)
✅ Future plans (shows scheduling in action)
✅ Backlog tasks (shows planning features)
✅ Goals tracking (shows progress monitoring)
✅ Attendance records (shows compliance tracking)

**Perfect for demos, testing, and development!** 🚀

---

## 🚀 Ready to Run

```sql
-- In Supabase SQL Editor
-- 1. Copy entire contents of: seed_max_lilly_schoolyear.sql
-- 2. Paste and Execute
-- 3. Watch NOTICE messages
-- 4. Refresh your app
-- 5. Browse and enjoy your fully populated homeschool!
```

